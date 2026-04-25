/**
 * LAYER: Semantic Engine
 * Executes a SemanticQuery against any source type (database, prepared dataset, file).
 * Returns aggregated, typed rows ready for chart rendering.
 */

import { executeDbQuery, ANALYTICS_MAX_ROWS } from '@/lib/db-connector';
import { parseFileContent, fetchFileRows } from '@/lib/file-utils';
import { prisma } from '@/lib/prisma';
import type {
  SemanticModel, SemanticQuery, QueryResult,
  FieldDef, CalcField, AggFunc, QueryDimension, QueryMeasure, QueryFilter,
} from './types';

const DEFAULT_ROW_LIMIT = 5000;

// ── Field resolution ──────────────────────────────────────────────────────────

function resolveField(model: SemanticModel, name: string): FieldDef | CalcField | null {
  return model.fields.find(f => f.name === name)
    || model.calculations.find(c => c.name === name)
    || null;
}

function evalCalc(expr: string, row: Record<string, unknown>): unknown {
  try {
    const subbed = expr.replace(/\b([a-zA-Z_]\w*)\b/g, m =>
      m in row ? String(row[m] ?? 0) : m,
    );
    if (!/^[\d\s+\-*/.(),]+$/.test(subbed)) return null;
    return Function(`"use strict"; return (${subbed})`)();
  } catch { return null; }
}

function applyCalcs(
  rows: Record<string, unknown>[],
  calcs: CalcField[],
): Record<string, unknown>[] {
  if (!calcs.length) return rows;
  return rows.map(r => {
    const out = { ...r };
    for (const c of calcs) out[c.name] = evalCalc(c.expression, r);
    return out;
  });
}

// ── Date binning ──────────────────────────────────────────────────────────────

function binDate(value: unknown, unit: string): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(String(value));
  if (isNaN(d.getTime())) return String(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  switch (unit) {
    case 'year':    return `${y}`;
    case 'quarter': return `${y}-Q${Math.floor(d.getMonth() / 3) + 1}`;
    case 'month':   return `${y}-${m}`;
    case 'week': {
      const onejan = new Date(y, 0, 1);
      const week = Math.ceil(
        (((d.getTime() - onejan.getTime()) / 86_400_000) + onejan.getDay() + 1) / 7,
      );
      return `${y}-W${String(week).padStart(2, '0')}`;
    }
    default: return `${y}-${m}-${day}`;
  }
}

// ── Filter application ────────────────────────────────────────────────────────

function applyFilters(
  rows: Record<string, unknown>[],
  filters: QueryFilter[],
): Record<string, unknown>[] {
  if (!filters.length) return rows;
  return rows.filter(row => filters.every(f => {
    const v = row[f.field];
    switch (f.op) {
      case '=':          return String(v) === String(f.value);
      case '!=':         return String(v) !== String(f.value);
      case '>':          return Number(v) > Number(f.value);
      case '<':          return Number(v) < Number(f.value);
      case '>=':         return Number(v) >= Number(f.value);
      case '<=':         return Number(v) <= Number(f.value);
      case 'in':         return (f.values ?? []).map(String).includes(String(v));
      case 'not_in':     return !(f.values ?? []).map(String).includes(String(v));
      case 'contains':   return String(v ?? '').toLowerCase().includes(String(f.value ?? '').toLowerCase());
      case 'between':    return Number(v) >= Number(f.min ?? -Infinity) && Number(v) <= Number(f.max ?? Infinity);
      case 'is_null':    return v === null || v === undefined || v === '';
      case 'is_not_null':return v !== null && v !== undefined && v !== '';
      default:           return true;
    }
  }));
}

// ── Aggregation ───────────────────────────────────────────────────────────────

/** Safe min/max using reduce — avoids call-stack overflow from spread on large arrays. */
function safeMin(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => (a < b ? a : b));
}
function safeMax(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => (a > b ? a : b));
}

function aggregate(values: unknown[], func: AggFunc): unknown {
  const nums = values.map(v => Number(v ?? 0)).filter(n => !isNaN(n));
  switch (func) {
    case 'sum':          return nums.reduce((a, b) => a + b, 0);
    case 'avg':          return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    case 'count':        return values.length;
    case 'count_distinct': return new Set(values.map(String)).size;
    case 'min':          return safeMin(nums);
    case 'max':          return safeMax(nums);
    case 'none':
    default:             return values[0] ?? null;
  }
}

// ── Apply binning to dimension values ─────────────────────────────────────────

function applyBinning(
  rows: Record<string, unknown>[],
  dim: QueryDimension,
): Record<string, unknown>[] {
  if (dim.dateUnit) {
    return rows.map(r => ({ ...r, [dim.field]: binDate(r[dim.field], dim.dateUnit!) }));
  }
  if (dim.binning?.type === 'width') {
    const nums = rows.map(r => Number(r[dim.field])).filter(n => !isNaN(n));
    if (!nums.length) return rows;
    const min = safeMin(nums)!;
    const max = safeMax(nums)!;
    const n = dim.binning.n || 10;
    const w = (max - min) / n || 1;
    return rows.map(r => {
      const v = Number(r[dim.field]);
      if (isNaN(v)) return { ...r, [dim.field]: 'null' };
      const idx = Math.min(Math.floor((v - min) / w), n - 1);
      const lo = (min + idx * w).toFixed(2);
      const hi = (min + (idx + 1) * w).toFixed(2);
      return { ...r, [dim.field]: `${lo}–${hi}` };
    });
  }
  return rows;
}

// ── Group + aggregate ─────────────────────────────────────────────────────────

function groupAndAggregate(
  rows: Record<string, unknown>[],
  dims: QueryDimension[],
  measures: QueryMeasure[],
): Record<string, unknown>[] {
  const dimFields = dims.map(d => d.field);

  let processed = rows;
  for (const d of dims) processed = applyBinning(processed, d);

  if (!measures.length) {
    const seen = new Set<string>();
    const out: Record<string, unknown>[] = [];
    for (const row of processed) {
      const key = dimFields.map(f => String(row[f] ?? '')).join('\x00');
      if (!seen.has(key)) {
        seen.add(key);
        const o: Record<string, unknown> = {};
        for (const f of dimFields) o[f] = row[f];
        out.push(o);
      }
    }
    return out;
  }

  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of processed) {
    const key = dimFields.length
      ? dimFields.map(f => String(row[f] ?? '')).join('\x00')
      : '__all__';
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const out: Record<string, unknown>[] = [];
  for (const bucket of groups.values()) {
    const o: Record<string, unknown> = {};
    for (const f of dimFields) o[f] = bucket[0][f];
    for (const m of measures) {
      const alias = m.alias || `${m.agg}_${m.field}`;
      o[alias] = aggregate(bucket.map(r => r[m.field]), m.agg);
    }
    out.push(o);
  }
  return out;
}

// ── Sorting + limit ───────────────────────────────────────────────────────────

function applySorting(
  rows: Record<string, unknown>[],
  dims: QueryDimension[],
  measures: QueryMeasure[],
): Record<string, unknown>[] {
  for (let i = dims.length - 1; i >= 0; i--) {
    const d = dims[i];
    if (!d.sort) continue;
    const dir = d.sort === 'desc' ? -1 : 1;
    rows = [...rows].sort((a, b) => {
      const av = a[d.field], bv = b[d.field];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
    });
  }
  if (!dims.some(d => d.sort) && measures.length) {
    const first = measures[0];
    const alias = first.alias || `${first.agg}_${first.field}`;
    rows = [...rows].sort((a, b) => Number(b[alias] ?? 0) - Number(a[alias] ?? 0));
  }
  for (const d of dims) {
    if (d.limit && d.limit > 0) rows = rows.slice(0, d.limit);
  }
  return rows;
}

// ── Source data fetching ──────────────────────────────────────────────────────

async function fetchSourceRows(
  model: SemanticModel,
  userId: string,
): Promise<Record<string, unknown>[]> {
  if (model.sourceType === 'database') {
    const sql = model.sourceSql
      || (model.sourceTable ? `SELECT * FROM "${model.sourceTable}" LIMIT ${ANALYTICS_MAX_ROWS}` : null);
    if (!sql) throw new Error('Database source requires sourceTable or sourceSql');
    // Pass ANALYTICS_MAX_ROWS so the connector doesn't cap at the 150-row explorer limit.
    const result = await executeDbQuery(model.sourceId, userId, sql, ANALYTICS_MAX_ROWS);
    return result.rows as Record<string, unknown>[];
  }

  if (model.sourceType === 'prepared_dataset') {
    const ds = await (prisma as any).preparedDataset.findFirst({
      where: { id: model.sourceId, userId },
    });
    if (!ds) throw new Error('Prepared dataset not found');
    try { return JSON.parse(ds.sampleRows) as Record<string, unknown>[]; }
    catch { return []; }
  }

  if (model.sourceType === 'file') {
    return fetchFileRows(model.sourceId, userId);
  }

  throw new Error(`Unknown source type: ${(model as any).sourceType}`);
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function executeSemanticQuery(
  model: SemanticModel,
  query: SemanticQuery,
  userId: string,
): Promise<QueryResult> {
  const start = Date.now();
  let rows = await fetchSourceRows(model, userId);
  const sourceRowCount = rows.length;
  const truncated = sourceRowCount >= ANALYTICS_MAX_ROWS;

  rows = applyCalcs(rows, model.calculations);
  rows = applyFilters(rows, query.filters);
  rows = groupAndAggregate(rows, query.dimensions, query.measures);
  rows = applySorting(rows, query.dimensions, query.measures);
  rows = rows.slice(0, query.rowLimit ?? DEFAULT_ROW_LIMIT);

  const columns: QueryResult['columns'] = [];
  for (const d of query.dimensions) {
    const f = resolveField(model, d.field);
    columns.push({ name: d.field, dataType: f?.dataType ?? 'string', role: 'dimension' });
  }
  for (const m of query.measures) {
    const alias = m.alias || `${m.agg}_${m.field}`;
    columns.push({ name: alias, dataType: 'number', role: 'measure' });
  }

  return {
    columns,
    rows,
    rowCount: rows.length,
    truncated,
    executionMs: Date.now() - start,
  };
}

// ── Auto-detect schema from sample rows ───────────────────────────────────────

export function detectSchema(sampleRows: Record<string, unknown>[]): FieldDef[] {
  if (!sampleRows.length) return [];
  const cols = Object.keys(sampleRows[0]);
  return cols.map(name => {
    const values = sampleRows
      .map(r => r[name])
      .filter(v => v !== null && v !== undefined && v !== '');
    if (!values.length) {
      return { name, displayName: humanize(name), dataType: 'string' as const, role: 'dimension' as const };
    }
    const allNum   = values.every(v => typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v))));
    const allBool  = values.every(v => typeof v === 'boolean');
    const dateLike = values.every(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v));
    let dataType: FieldDef['dataType'] = 'string';
    if (allBool) dataType = 'boolean';
    else if (dateLike) dataType = 'date';
    else if (allNum) dataType = 'number';
    const role: FieldDef['role'] = dataType === 'number' ? 'measure' : 'dimension';
    return {
      name,
      displayName: humanize(name),
      dataType,
      role,
      defaultAgg: role === 'measure' ? 'sum' : undefined,
    };
  });
}

function humanize(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
}

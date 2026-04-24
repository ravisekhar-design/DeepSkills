import { executeDbQuery } from '@/lib/db-connector';
import type {
  PrepStep, StepPreviewResult, ColumnSchema,
  FilterCondition, RenameOp, AggregationOp, JoinCondition,
} from './types';

const MAX_SOURCE_ROWS = 5000;

// ── Type inference ─────────────────────────────────────────────────────────────

function inferColType(value: unknown): ColumnSchema['type'] {
  if (value === null || value === undefined) return 'unknown';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (value instanceof Date) return 'date';
  if (typeof value === 'string') {
    if (value.trim() !== '' && !isNaN(Number(value))) return 'number';
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
  }
  return 'string';
}

function deriveSchema(rows: Record<string, unknown>[]): ColumnSchema[] {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]).map(name => ({
    name,
    type: inferColType(rows[0][name]),
  }));
}

// ── Transform functions ────────────────────────────────────────────────────────

function applyFilter(
  rows: Record<string, unknown>[],
  conditions: FilterCondition[],
): Record<string, unknown>[] {
  if (!conditions.length) return rows;
  return rows.filter(row => {
    let result = true;
    for (let i = 0; i < conditions.length; i++) {
      const { column, operator, value, logicOp } = conditions[i];
      const cell = row[column];
      let match: boolean;
      switch (operator) {
        case '=': match = String(cell ?? '') === value; break;
        case '!=': match = String(cell ?? '') !== value; break;
        case '>': match = Number(cell) > Number(value); break;
        case '<': match = Number(cell) < Number(value); break;
        case '>=': match = Number(cell) >= Number(value); break;
        case '<=': match = Number(cell) <= Number(value); break;
        case 'contains': match = String(cell ?? '').toLowerCase().includes(value.toLowerCase()); break;
        case 'not_contains': match = !String(cell ?? '').toLowerCase().includes(value.toLowerCase()); break;
        case 'is_null': match = cell === null || cell === undefined || cell === ''; break;
        case 'is_not_null': match = cell !== null && cell !== undefined && cell !== ''; break;
        default: match = true;
      }
      result = i === 0 ? match : logicOp === 'OR' ? result || match : result && match;
    }
    return result;
  });
}

function applyRename(
  rows: Record<string, unknown>[],
  operations: RenameOp[],
): Record<string, unknown>[] {
  if (!operations.length) return rows;
  return rows.map(row => {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(row)) {
      const op = operations.find(o => o.column === key);
      if (op?.remove) continue;
      const newKey = op?.newName?.trim() || key;
      let newVal: unknown = val;
      if (op?.newType) {
        switch (op.newType) {
          case 'number': newVal = val !== null && val !== '' ? Number(val) : null; break;
          case 'string': newVal = val === null ? null : String(val); break;
          case 'boolean': newVal = Boolean(val); break;
          case 'date': newVal = val ? new Date(String(val)).toISOString() : null; break;
        }
      }
      out[newKey] = newVal;
    }
    return out;
  });
}

function applyAggregate(
  rows: Record<string, unknown>[],
  groupBy: string[],
  aggregations: AggregationOp[],
): Record<string, unknown>[] {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = groupBy.length ? groupBy.map(g => String(row[g] ?? '')).join('\x00') : '__all__';
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  return Array.from(groups.values()).map(bucket => {
    const out: Record<string, unknown> = {};
    for (const g of groupBy) out[g] = bucket[0][g];
    for (const agg of aggregations) {
      const vals = bucket.map(r => r[agg.column]);
      const nums = vals.map(v => Number(v ?? 0));
      switch (agg.func) {
        case 'count': out[agg.alias] = bucket.length; break;
        case 'count_distinct': out[agg.alias] = new Set(vals.map(String)).size; break;
        case 'sum': out[agg.alias] = nums.reduce((a, b) => a + b, 0); break;
        case 'avg': out[agg.alias] = nums.reduce((a, b) => a + b, 0) / nums.length; break;
        case 'min': out[agg.alias] = Math.min(...nums); break;
        case 'max': out[agg.alias] = Math.max(...nums); break;
      }
    }
    return out;
  });
}

function applyJoin(
  left: Record<string, unknown>[],
  right: Record<string, unknown>[],
  joinType: string,
  conditions: JoinCondition[],
): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  const rightUsed = new Set<number>();

  for (const leftRow of left) {
    const matches: number[] = [];
    for (let ri = 0; ri < right.length; ri++) {
      if (conditions.every(c => String(leftRow[c.leftCol] ?? '') === String(right[ri][c.rightCol] ?? ''))) {
        matches.push(ri);
      }
    }
    if (matches.length) {
      for (const ri of matches) {
        rightUsed.add(ri);
        const rightRow: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(right[ri])) {
          rightRow[k in leftRow ? `right_${k}` : k] = v;
        }
        result.push({ ...leftRow, ...rightRow });
      }
    } else if (joinType === 'left' || joinType === 'full') {
      result.push({ ...leftRow });
    }
  }
  if (joinType === 'right' || joinType === 'full') {
    for (let ri = 0; ri < right.length; ri++) {
      if (!rightUsed.has(ri)) result.push({ ...right[ri] });
    }
  }
  return result;
}

function applyUnion(
  left: Record<string, unknown>[],
  right: Record<string, unknown>[],
  all: boolean,
): Record<string, unknown>[] {
  const combined = [...left, ...right];
  if (all) return combined;
  const seen = new Set<string>();
  return combined.filter(row => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeFlow(
  steps: PrepStep[],
  userId: string,
  upToIndex?: number,
): Promise<StepPreviewResult> {
  const limit = upToIndex !== undefined ? upToIndex + 1 : steps.length;
  let rows: Record<string, unknown>[] = [];
  let schema: ColumnSchema[] = [];

  for (let i = 0; i < limit; i++) {
    const { config } = steps[i];
    try {
      switch (config.type) {
        case 'source': {
          const result = await executeDbQuery(config.connectionId, userId, config.sql);
          rows = (result.rows as Record<string, unknown>[]).slice(0, MAX_SOURCE_ROWS);
          schema = deriveSchema(rows);
          break;
        }
        case 'filter': {
          rows = applyFilter(rows, config.conditions);
          schema = deriveSchema(rows);
          break;
        }
        case 'rename': {
          rows = applyRename(rows, config.operations);
          schema = deriveSchema(rows);
          break;
        }
        case 'aggregate': {
          rows = applyAggregate(rows, config.groupBy, config.aggregations);
          schema = deriveSchema(rows);
          break;
        }
        case 'join': {
          const rr = await executeDbQuery(config.rightConnectionId, userId, config.rightSql);
          const rightRows = (rr.rows as Record<string, unknown>[]).slice(0, MAX_SOURCE_ROWS);
          rows = applyJoin(rows, rightRows, config.joinType, config.conditions);
          schema = deriveSchema(rows);
          break;
        }
        case 'union': {
          const rr = await executeDbQuery(config.rightConnectionId, userId, config.rightSql);
          const rightRows = (rr.rows as Record<string, unknown>[]).slice(0, MAX_SOURCE_ROWS);
          rows = applyUnion(rows, rightRows, config.all);
          schema = deriveSchema(rows);
          break;
        }
        case 'output':
          break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Step execution failed';
      return { schema, rows, rowCount: rows.length, error: `Step ${i + 1} (${config.type}): ${msg}` };
    }
  }

  return { schema, rows, rowCount: rows.length };
}

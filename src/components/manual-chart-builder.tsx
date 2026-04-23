"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Plus, X, Play, Loader2, Filter, ArrowUpDown, Tag, GripHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ChartRenderer } from "@/components/chart-renderer";
import type { GeneratedChartConfig, ChartType, ChartSeries, ChartFilter } from "@/ai/flows/chart-generation";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Column { name: string; type: string; }

type AggFunc = 'none' | 'sum' | 'avg' | 'count' | 'count_distinct' | 'min' | 'max';
type SeriesType = 'bar' | 'line' | 'area';
type SortOrder = 'default' | 'asc' | 'desc';

interface MeasureConfig {
  id: string;
  field: string;
  agg: AggFunc;
  seriesType: SeriesType;
  color: string;
}

export interface ManualChartBuilderProps {
  columns: Column[];
  rows: any[];
  sourceType: 'database' | 'file';
  connectionId?: string;
  tableName?: string;
  dbType?: string;
  onGenerate: (config: GeneratedChartConfig, title: string) => void;
  initialConfig?: GeneratedChartConfig; // pre-populate when editing an existing chart
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHART_COLORS = ['#6366f1', '#22d3ee', '#a3e635', '#f59e0b', '#ef4444', '#8b5cf6'];

const AGG_OPTIONS: { value: AggFunc; label: string }[] = [
  { value: 'sum',            label: 'SUM' },
  { value: 'avg',            label: 'AVG' },
  { value: 'count',          label: 'COUNT' },
  { value: 'count_distinct', label: 'COUNT DIST.' },
  { value: 'min',            label: 'MIN' },
  { value: 'max',            label: 'MAX' },
  { value: 'none',           label: 'None' },
];

const SERIES_TYPE_OPTIONS: { value: SeriesType; label: string }[] = [
  { value: 'bar',  label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
];

const FILTER_OPERATORS: { value: ChartFilter['operator']; label: string }[] = [
  { value: '=',            label: '=' },
  { value: '!=',           label: '≠' },
  { value: '>',            label: '>' },
  { value: '<',            label: '<' },
  { value: '>=',           label: '≥' },
  { value: '<=',           label: '≤' },
  { value: 'contains',     label: 'contains' },
  { value: 'not_contains', label: 'not contains' },
  { value: 'is_empty',     label: 'is empty' },
  { value: 'is_not_empty', label: 'not empty' },
];

const CHART_TYPES: { type: ChartType; label: string; group: string }[] = [
  { type: 'bar',            label: 'Bar',         group: 'Comparison' },
  { type: 'horizontal_bar', label: 'H. Bar',      group: 'Comparison' },
  { type: 'stacked_bar',    label: 'Stacked',     group: 'Comparison' },
  { type: 'waterfall',      label: 'Waterfall',   group: 'Comparison' },
  { type: 'line',           label: 'Line',        group: 'Trend' },
  { type: 'area',           label: 'Area',        group: 'Trend' },
  { type: 'pie',            label: 'Pie',         group: 'Part-to-Whole' },
  { type: 'donut',          label: 'Donut',       group: 'Part-to-Whole' },
  { type: 'treemap',        label: 'Treemap',     group: 'Part-to-Whole' },
  { type: 'funnel',         label: 'Funnel',      group: 'Sequential' },
  { type: 'scatter',        label: 'Scatter',     group: 'Correlation' },
  { type: 'bubble',         label: 'Bubble',      group: 'Correlation' },
  { type: 'radar',          label: 'Radar',       group: 'Multi-Metric' },
  { type: 'heatmap',        label: 'Heatmap',     group: 'Multi-Metric' },
  { type: 'radial_bar',     label: 'Radial Bar',  group: 'Progress' },
  { type: 'gauge',          label: 'Gauge',       group: 'Progress' },
  { type: 'composed',       label: 'Composed',    group: 'Advanced' },
  { type: 'sankey',         label: 'Sankey',      group: 'Advanced' },
];

// Chart-specific UI configuration
interface ChartUIConfig {
  xLabel: string;
  yLabel: string;
  showGroupBy: boolean;
  showTarget: boolean;   // sankey
  maxMeasures: number;
  measureLabels?: string[];
}

function getChartUIConfig(chartType: ChartType): ChartUIConfig {
  switch (chartType) {
    case 'sankey':
      return { xLabel: 'Source Column', yLabel: 'Flow Value', showGroupBy: false, showTarget: true, maxMeasures: 1 };
    case 'bubble':
      return { xLabel: 'Label / Name', yLabel: 'Values', showGroupBy: false, showTarget: false, maxMeasures: 3, measureLabels: ['X Axis', 'Y Axis', 'Bubble Size'] };
    case 'gauge':
      return { xLabel: 'Label Column', yLabel: 'Value', showGroupBy: false, showTarget: false, maxMeasures: 2, measureLabels: ['Current Value', 'Max Value (opt.)'] };
    case 'heatmap':
      return { xLabel: 'X Axis', yLabel: 'Color Intensity', showGroupBy: true, showTarget: false, maxMeasures: 1 };
    case 'pie': case 'donut': case 'treemap': case 'funnel': case 'radial_bar': case 'waterfall':
      return { xLabel: 'Category / Label', yLabel: 'Value', showGroupBy: false, showTarget: false, maxMeasures: 1 };
    default:
      return { xLabel: 'X-Axis / Category', yLabel: 'Y-Axis / Values', showGroupBy: true, showTarget: false, maxMeasures: 6 };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isNumericType(type: string): boolean {
  const t = (type || '').toLowerCase();
  return ['number', 'integer', 'int', 'bigint', 'smallint', 'decimal', 'numeric',
          'float', 'real', 'double', 'float4', 'float8', 'int4', 'int8', 'money',
          'tinyint', 'mediumint'].some(n => t.includes(n));
}

function aggValue(groupRows: any[], field: string, func: AggFunc): number {
  if (func === 'count') return groupRows.length;
  if (func === 'count_distinct') return new Set(groupRows.map(r => r[field])).size;
  const nums = groupRows.map(r => Number(r[field])).filter(v => !isNaN(v));
  if (nums.length === 0) return 0;
  if (func === 'sum') return nums.reduce((a, b) => a + b, 0);
  if (func === 'avg') return parseFloat((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(4));
  if (func === 'min') return Math.min(...nums);
  if (func === 'max') return Math.max(...nums);
  return Number(groupRows[0]?.[field] ?? 0);
}

function measureDataKey(m: MeasureConfig): string {
  return m.agg === 'none' ? m.field : `${m.field}__${m.agg}`;
}

function measureDisplayName(m: MeasureConfig): string {
  if (m.agg === 'none') return m.field;
  const label = AGG_OPTIONS.find(a => a.value === m.agg)?.label ?? m.agg.toUpperCase();
  return `${label}(${m.field})`;
}

function applyFilters(rows: any[], filters: ChartFilter[]): any[] {
  if (!filters.length) return rows;
  return rows.filter(row =>
    filters.every(f => {
      if (!f.column || !f.operator) return true;
      const val = row[f.column];
      const strVal = String(val ?? '').toLowerCase();
      const filterVal = (f.value ?? '').toLowerCase();
      switch (f.operator) {
        case '=': return String(val) === f.value;
        case '!=': return String(val) !== f.value;
        case '>': return Number(val) > Number(f.value);
        case '<': return Number(val) < Number(f.value);
        case '>=': return Number(val) >= Number(f.value);
        case '<=': return Number(val) <= Number(f.value);
        case 'contains': return strVal.includes(filterVal);
        case 'not_contains': return !strVal.includes(filterVal);
        case 'is_empty': return val == null || String(val) === '';
        case 'is_not_empty': return val != null && String(val) !== '';
        default: return true;
      }
    })
  );
}

function sortRows(data: any[], xField: string, order: SortOrder): any[] {
  if (order === 'default' || !xField) return data;
  return [...data].sort((a, b) => {
    const va = a[xField], vb = b[xField];
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va ?? '').localeCompare(String(vb ?? ''));
    return order === 'asc' ? cmp : -cmp;
  });
}

function buildFileData(
  rows: any[],
  xField: string,
  measures: MeasureConfig[],
  groupBy: string,
  filters: ChartFilter[],
  sortOrder: SortOrder,
): { data: any[]; series: ChartSeries[] } {
  if (!xField || measures.length === 0 || measures[0].field === '') return { data: [], series: [] };

  const filteredRows = applyFilters(rows, filters);

  if (!groupBy) {
    const buckets = new Map<string, any[]>();
    for (const row of filteredRows) {
      const k = String(row[xField] ?? '(blank)');
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(row);
    }
    let data = Array.from(buckets).map(([xVal, bRows]) => {
      const entry: any = { [xField]: xVal };
      for (const m of measures) entry[measureDataKey(m)] = aggValue(bRows, m.field, m.agg);
      return entry;
    });
    data = sortRows(data, xField, sortOrder);
    const series: ChartSeries[] = measures.map(m => ({
      dataKey: measureDataKey(m),
      name: measureDisplayName(m),
      color: m.color,
      seriesType: m.seriesType,
    }));
    return { data, series };
  }

  // Group by
  const m = measures[0];
  const buckets2 = new Map<string, Map<string, any[]>>();
  const seriesSet = new Set<string>();

  for (const row of filteredRows) {
    const xVal = String(row[xField] ?? '(blank)');
    const gVal = String(row[groupBy] ?? '(blank)');
    seriesSet.add(gVal);
    if (!buckets2.has(xVal)) buckets2.set(xVal, new Map());
    const inner = buckets2.get(xVal)!;
    if (!inner.has(gVal)) inner.set(gVal, []);
    inner.get(gVal)!.push(row);
  }

  const seriesNames = Array.from(seriesSet).sort();
  let data = Array.from(buckets2).map(([xVal, innerMap]) => {
    const entry: any = { [xField]: xVal };
    for (const gVal of seriesNames) entry[gVal] = aggValue(innerMap.get(gVal) || [], m.field, m.agg);
    return entry;
  });
  data = sortRows(data, xField, sortOrder);
  const series: ChartSeries[] = seriesNames.map((gVal, i) => ({
    dataKey: gVal,
    name: gVal,
    color: CHART_COLORS[i % CHART_COLORS.length],
    seriesType: m.seriesType,
  }));

  return { data, series };
}

function buildSql(
  tableName: string,
  xField: string,
  measures: MeasureConfig[],
  groupBy: string,
  filters: ChartFilter[],
  sortOrder: SortOrder,
  dbType = 'postgresql',
): string {
  const safe = (col: string) => col.replace(/[^a-zA-Z0-9_ ]/g, '');
  const q = dbType === 'mysql' ? (c: string) => `\`${safe(c)}\`` : (c: string) => `"${safe(c)}"`;
  const safeTable = safe(tableName);

  const aggExpr = (m: MeasureConfig): string => {
    const alias = q(measureDataKey(m));
    if (m.agg === 'none') return `${q(m.field)} AS ${alias}`;
    if (m.agg === 'count') return `COUNT(*) AS ${alias}`;
    if (m.agg === 'count_distinct') return `COUNT(DISTINCT ${q(m.field)}) AS ${alias}`;
    return `${m.agg.toUpperCase()}(${q(m.field)}) AS ${alias}`;
  };

  const hasAgg = measures.some(m => m.agg !== 'none');
  const selectCols = [
    q(xField),
    ...(groupBy ? [q(groupBy)] : []),
    ...measures.map(aggExpr),
  ].join(', ');

  let sql = `SELECT ${selectCols} FROM ${safeTable}`;

  // WHERE from filters
  const conditions = filters
    .filter(f => f.column && f.operator)
    .map(f => {
      const col = q(f.column);
      const esc = (v: string) => v.replace(/'/g, "''");
      switch (f.operator) {
        case '=': return `${col} = '${esc(f.value)}'`;
        case '!=': return `${col} != '${esc(f.value)}'`;
        case '>': return `${col} > ${Number(f.value) || 0}`;
        case '<': return `${col} < ${Number(f.value) || 0}`;
        case '>=': return `${col} >= ${Number(f.value) || 0}`;
        case '<=': return `${col} <= ${Number(f.value) || 0}`;
        case 'contains': return `${col} LIKE '%${esc(f.value)}%'`;
        case 'not_contains': return `${col} NOT LIKE '%${esc(f.value)}%'`;
        case 'is_empty': return `(${col} IS NULL OR ${col} = '')`;
        case 'is_not_empty': return `(${col} IS NOT NULL AND ${col} != '')`;
        default: return '';
      }
    })
    .filter(Boolean);

  if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;

  if (hasAgg) {
    const groupCols = [q(xField), ...(groupBy ? [q(groupBy)] : [])].join(', ');
    sql += ` GROUP BY ${groupCols}`;
  }
  const dir = sortOrder === 'desc' ? 'DESC' : 'ASC';
  sql += ` ORDER BY ${q(xField)} ${sortOrder === 'default' ? '' : dir} LIMIT 500`.replace(/\s+/g, ' ');
  return sql;
}

function pivotDbRows(
  rows: any[],
  xField: string,
  groupByField: string,
  measureDk: string,
): { data: any[]; series: ChartSeries[] } {
  const seriesNames = Array.from(new Set(rows.map(r => String(r[groupByField] ?? '')))).sort();
  const xValues    = Array.from(new Set(rows.map(r => String(r[xField] ?? ''))));
  const data = xValues.map(xVal => {
    const entry: any = { [xField]: xVal };
    for (const gVal of seriesNames) {
      const match = rows.find(r => String(r[xField]) === xVal && String(r[groupByField]) === gVal);
      entry[gVal] = match ? Number(match[measureDk] ?? 0) : 0;
    }
    return entry;
  });
  const series: ChartSeries[] = seriesNames.map((gVal, i) => ({
    dataKey: gVal,
    name: gVal,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
  return { data, series };
}

function autoTitle(chartType: ChartType, xField: string, measures: MeasureConfig[], groupBy: string): string {
  const typeLabel = CHART_TYPES.find(c => c.type === chartType)?.label ?? chartType;
  const mLabel    = measures.map(m => measureDisplayName(m)).join(', ');
  let t = `${typeLabel}: ${mLabel} by ${xField}`;
  if (groupBy) t += ` (by ${groupBy})`;
  return t;
}

let _id = 0;
const newId = () => `m${++_id}`;
let _filterId = 0;
const newFilterId = () => `f${++_filterId}`;

// Reconstruct MeasureConfig from a saved series entry (dataKey = field__agg or plain field)
function parseMeasureFromSeries(s: ChartSeries, idx: number): MeasureConfig {
  const dk = s.dataKey;
  const match = dk.match(/^(.+)__(sum|avg|count|count_distinct|min|max|none)$/);
  if (match) {
    return {
      id: newId(),
      field: match[1],
      agg: match[2] as AggFunc,
      seriesType: (s.seriesType as SeriesType) || 'bar',
      color: s.color || CHART_COLORS[idx % CHART_COLORS.length],
    };
  }
  // dataKey is a plain column name (no-agg or group-pivot value)
  return {
    id: newId(),
    field: dk,
    agg: 'none',
    seriesType: (s.seriesType as SeriesType) || 'bar',
    color: s.color || CHART_COLORS[idx % CHART_COLORS.length],
  };
}

// ── FieldChip — draggable column pill ─────────────────────────────────────────

function FieldChip({ col, isNumeric }: { col: Column; isNumeric: boolean }) {
  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('application/x-field', JSON.stringify(col));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-secondary/20 cursor-grab active:cursor-grabbing hover:border-accent/50 hover:bg-secondary/40 transition-colors group select-none"
      title={`Drag to configure • ${col.type}`}
    >
      <span className={`size-2 rounded-full shrink-0 ${isNumeric ? 'bg-green-400' : 'bg-blue-400'}`} />
      <span className="text-[11px] font-mono truncate max-w-[80px]">{col.name}</span>
      <GripHorizontal className="size-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </div>
  );
}

// ── DropZone — highlighted drop target ───────────────────────────────────────

function DropZone({
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
  className = '',
}: {
  isOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`rounded-lg border-2 border-dashed transition-all ${isOver ? 'border-accent bg-accent/8' : 'border-border/40'} ${className}`}
    >
      {children}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ManualChartBuilder({
  columns,
  rows,
  sourceType,
  connectionId,
  tableName,
  dbType,
  onGenerate,
  initialConfig,
}: ManualChartBuilderProps) {
  const dimensions  = useMemo(() => columns.filter(c => !isNumericType(c.type)), [columns]);
  const numericCols = useMemo(() => columns.filter(c =>  isNumericType(c.type)), [columns]);

  // Derive initial measures from saved series (only used during mount)
  const initMeasures = useMemo((): MeasureConfig[] => {
    if (!initialConfig?.series?.length) {
      return [{ id: newId(), field: '', agg: 'sum', seriesType: 'bar', color: CHART_COLORS[0] }];
    }
    const parsed = initialConfig.series.map((s, i) => parseMeasureFromSeries(s, i));
    // Deduplicate: if all parsed fields are the same (group-pivot case), keep only first
    const uniqueFields = new Set(parsed.map(m => m.field));
    if (uniqueFields.size === 1 && parsed.length > 1) {
      return [parsed[0]]; // was a group-pivot chart — restore single measure
    }
    return parsed;
  }, []); // eslint-disable-line — run once on mount only

  const [chartType,    setChartType]    = useState<ChartType>(() => (initialConfig?.chartType as ChartType) || 'bar');
  const [xField,       setXField]       = useState(() => initialConfig?.xKey || '');
  const [targetField,  setTargetField]  = useState('');
  const [measures,     setMeasures]     = useState<MeasureConfig[]>(initMeasures);
  const [groupBy,      setGroupBy]      = useState('');
  const [sortOrder,    setSortOrder]    = useState<SortOrder>(() => (initialConfig?.sortOrder as SortOrder) || 'default');
  const [showLabels,   setShowLabels]   = useState(() => initialConfig?.showLabels ?? false);
  const [filters,      setFilters]      = useState<ChartFilter[]>(() => initialConfig?.filters ?? []);
  const [dragOverZone, setDragOverZone] = useState<string | null>(null);
  const [preview,      setPreview]      = useState<GeneratedChartConfig | null>(null);
  const [running,      setRunning]      = useState(false);
  const [runError,     setRunError]     = useState('');

  const uiCfg = useMemo(() => getChartUIConfig(chartType), [chartType]);

  // Auto-seed defaults once columns arrive (only fills empty values — won't override initialConfig)
  useEffect(() => {
    if (columns.length === 0) return;
    setXField(prev => prev || dimensions[0]?.name || columns[0]?.name || '');
    setMeasures(prev => {
      if (prev[0]?.field !== '') return prev;
      return [{ ...prev[0], field: numericCols[0]?.name || columns[0]?.name || '' }];
    });
  }, [columns]); // eslint-disable-line

  const isReady = Boolean(xField && measures.length > 0 && measures[0].field);

  // ── Measure management ────────────────────────────────────────────────────
  const addMeasure = () => {
    setMeasures(prev => {
      if (prev.length >= uiCfg.maxMeasures) return prev;
      return [...prev, {
        id: newId(),
        field: numericCols[0]?.name || columns[0]?.name || '',
        agg: 'sum',
        seriesType: 'bar',
        color: CHART_COLORS[prev.length % CHART_COLORS.length],
      }];
    });
  };

  const removeMeasure = (id: string) =>
    setMeasures(prev => prev.length > 1 ? prev.filter(m => m.id !== id) : prev);

  const patchMeasure = (id: string, patch: Partial<MeasureConfig>) =>
    setMeasures(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));

  // ── Drag-and-drop handlers ────────────────────────────────────────────────
  const extractField = (e: React.DragEvent): Column | null => {
    try { return JSON.parse(e.dataTransfer.getData('application/x-field')); } catch { return null; }
  };

  const makeZoneHandlers = (zone: string, onDrop: (col: Column) => void) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOverZone(zone); },
    onDragLeave: () => setDragOverZone(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverZone(null);
      const col = extractField(e);
      if (col) onDrop(col);
    },
  });

  // ── Core builder ──────────────────────────────────────────────────────────
  const buildChart = useCallback(async () => {
    if (!isReady) return;
    setRunning(true);
    setRunError('');

    try {
      let data: any[];
      let series: ChartSeries[];
      let sql: string | null = null;

      if (sourceType === 'file') {
        const r = buildFileData(rows, xField, measures, groupBy, filters, sortOrder);
        data   = r.data;
        series = r.series;
      } else {
        sql = buildSql(tableName || '', xField, measures, groupBy, filters, sortOrder, dbType);
        const res = await fetch('/api/dashboards/refresh-widget', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId, sql }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Query failed');

        const dbRows: any[] = json.data.rows;
        if (groupBy && measures.length > 0) {
          const p = pivotDbRows(dbRows, xField, groupBy, measureDataKey(measures[0]));
          data   = sortRows(p.data, xField, sortOrder);
          series = p.series;
        } else {
          data   = sortRows(dbRows, xField, sortOrder);
          series = measures.map((m) => ({
            dataKey: measureDataKey(m),
            name: measureDisplayName(m),
            color: m.color,
            seriesType: m.seriesType,
          }));
        }
      }

      const title = autoTitle(chartType, xField, measures, groupBy);
      const config: GeneratedChartConfig = {
        chartType, title, xKey: xField, series, data, sql,
        ...(chartType === 'sankey' && targetField ? { targetKey: targetField } : {}),
        ...(filters.length ? { filters } : {}),
        ...(showLabels ? { showLabels } : {}),
        ...(sortOrder !== 'default' ? { sortOrder } : {}),
      };
      setPreview(config);
      onGenerate(config, title);
    } catch (err: any) {
      setRunError(err.message || 'Failed to build chart');
    }

    setRunning(false);
  }, [isReady, sourceType, rows, xField, measures, groupBy, chartType, connectionId, tableName, dbType, onGenerate, filters, sortOrder, showLabels, targetField]); // eslint-disable-line

  // Auto-update preview for file sources
  useEffect(() => {
    if (sourceType !== 'file' || !isReady) return;
    const t = setTimeout(buildChart, 250);
    return () => clearTimeout(t);
  }, [sourceType, isReady, xField, JSON.stringify(measures), groupBy, chartType, JSON.stringify(filters), sortOrder, showLabels]); // eslint-disable-line

  // Chart type selection — clamp maxMeasures
  const handleChartTypeChange = (t: ChartType) => {
    const cfg = getChartUIConfig(t);
    setChartType(t);
    setMeasures(prev => prev.slice(0, cfg.maxMeasures));
    if (!cfg.showGroupBy) setGroupBy('');
    if (!cfg.showTarget) setTargetField('');
  };

  const groups = useMemo(() => Array.from(new Set(CHART_TYPES.map(c => c.group))), []);

  return (
    <div className="space-y-4">

      {/* ── Chart type selector ────────────────────────────────────────────── */}
      <div className="space-y-1">
        {groups.map(grp => (
          <div key={grp} className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase w-[72px] shrink-0">{grp}</span>
            {CHART_TYPES.filter(c => c.group === grp).map(ct => (
              <button
                key={ct.type}
                onClick={() => handleChartTypeChange(ct.type)}
                className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors border ${
                  chartType === ct.type
                    ? 'bg-accent text-accent-foreground border-accent shadow-sm'
                    : 'border-border/60 text-muted-foreground hover:border-accent/50 hover:text-foreground'
                }`}
              >
                {ct.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* ── Fields + Config ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-3">

        {/* LEFT: Draggable field list */}
        <div className="col-span-2 rounded-lg border border-border/40 bg-black/10 p-2.5 space-y-2.5 overflow-y-auto max-h-72">
          <div>
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <span className="size-2 rounded-full bg-blue-400 inline-block" />
              Dimensions ({dimensions.length})
            </p>
            {dimensions.length === 0
              ? <p className="text-[10px] text-muted-foreground italic">None detected</p>
              : <div className="flex flex-wrap gap-1">{dimensions.map(c => <FieldChip key={c.name} col={c} isNumeric={false} />)}</div>
            }
          </div>
          <div>
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <span className="size-2 rounded-full bg-green-400 inline-block" />
              Measures ({numericCols.length})
            </p>
            {numericCols.length === 0
              ? <p className="text-[10px] text-muted-foreground italic">None detected</p>
              : <div className="flex flex-wrap gap-1">{numericCols.map(c => <FieldChip key={c.name} col={c} isNumeric={true} />)}</div>
            }
          </div>
          <p className="text-[9px] text-muted-foreground/60 italic mt-1">Drag fields to the zones →</p>
        </div>

        {/* RIGHT: Configuration drop zones */}
        <div className="col-span-3 space-y-2.5">

          {/* X-Axis Zone */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{uiCfg.xLabel}</p>
            <DropZone
              isOver={dragOverZone === 'x'}
              {...makeZoneHandlers('x', col => setXField(col.name))}
              className="p-2 min-h-[36px]"
            >
              {xField ? (
                <div className="flex items-center gap-1.5">
                  <span className={`size-2 rounded-full shrink-0 ${isNumericType(columns.find(c => c.name === xField)?.type || '') ? 'bg-green-400' : 'bg-blue-400'}`} />
                  <span className="text-xs font-mono flex-1 truncate">{xField}</span>
                  <button onClick={() => setXField('')} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/50 italic">drop here or</span>
                  <Select value={xField || '__none__'} onValueChange={v => setXField(v === '__none__' ? '' : v)}>
                    <SelectTrigger className="h-6 text-xs flex-1 min-w-0">
                      <SelectValue placeholder="select field…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs text-muted-foreground">— Select —</SelectItem>
                      {columns.map(c => <SelectItem key={c.name} value={c.name} className="text-xs font-mono">{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </DropZone>
          </div>

          {/* Target Zone (Sankey only) */}
          {uiCfg.showTarget && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Target Column</p>
              <DropZone
                isOver={dragOverZone === 'target'}
                {...makeZoneHandlers('target', col => setTargetField(col.name))}
                className="p-2 min-h-[36px]"
              >
                {targetField ? (
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-accent shrink-0" />
                    <span className="text-xs font-mono flex-1 truncate">{targetField}</span>
                    <button onClick={() => setTargetField('')} className="text-muted-foreground hover:text-destructive">
                      <X className="size-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground/50 italic">drop target column or</span>
                    <Select value={targetField || '__none__'} onValueChange={v => setTargetField(v === '__none__' ? '' : v)}>
                      <SelectTrigger className="h-6 text-xs flex-1">
                        <SelectValue placeholder="select…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" className="text-xs text-muted-foreground">— Select —</SelectItem>
                        {columns.filter(c => c.name !== xField).map(c => <SelectItem key={c.name} value={c.name} className="text-xs font-mono">{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </DropZone>
            </div>
          )}

          {/* Y-Axis Measures Zone */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{uiCfg.yLabel}</p>
              {measures.length < uiCfg.maxMeasures && (
                <Button
                  size="sm" variant="ghost"
                  className="h-5 px-1.5 text-[10px] gap-0.5"
                  onClick={addMeasure}
                  disabled={!uiCfg.showGroupBy && !!groupBy}
                  title={groupBy && measures.length >= 1 ? 'Multiple Y-axis fields with Group By: first field is used for pivoting' : undefined}
                >
                  <Plus className="size-3" /> Add
                </Button>
              )}
            </div>
            <DropZone
              isOver={dragOverZone === 'y'}
              {...makeZoneHandlers('y', col => {
                const isNum = isNumericType(col.type);
                setMeasures(prev => {
                  // If only one empty measure, replace it
                  if (prev.length === 1 && !prev[0].field) {
                    return [{ ...prev[0], field: col.name, agg: isNum ? 'sum' : 'count' }];
                  }
                  if (prev.length >= uiCfg.maxMeasures) return prev;
                  return [...prev, {
                    id: newId(),
                    field: col.name,
                    agg: isNum ? 'sum' : 'count',
                    seriesType: 'bar',
                    color: CHART_COLORS[prev.length % CHART_COLORS.length],
                  }];
                });
              })}
              className="p-2 space-y-1.5"
            >
              {measures.map((m, idx) => (
                <div key={m.id} className="flex gap-1 items-center">
                  {/* Color swatch */}
                  <label className="cursor-pointer shrink-0" title="Change color">
                    <span className="size-5 rounded border border-border block" style={{ background: m.color }} />
                    <input
                      type="color"
                      value={m.color}
                      onChange={e => patchMeasure(m.id, { color: e.target.value })}
                      className="sr-only"
                    />
                  </label>
                  {/* Label for bubble/gauge */}
                  {uiCfg.measureLabels?.[idx] && (
                    <span className="text-[9px] text-muted-foreground uppercase shrink-0 w-14">{uiCfg.measureLabels[idx]}</span>
                  )}
                  {/* Field */}
                  <Select
                    value={m.field || '__none__'}
                    onValueChange={v => patchMeasure(m.id, { field: v === '__none__' ? '' : v })}
                  >
                    <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                      <SelectValue placeholder="Column…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs text-muted-foreground">— Select —</SelectItem>
                      {columns.map(c => <SelectItem key={c.name} value={c.name} className="text-xs font-mono">{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {/* Aggregation */}
                  <Select value={m.agg} onValueChange={v => patchMeasure(m.id, { agg: v as AggFunc })}>
                    <SelectTrigger className="h-7 text-xs w-24 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGG_OPTIONS.map(a => <SelectItem key={a.value} value={a.value} className="text-xs">{a.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {/* Series type (composed only) */}
                  {chartType === 'composed' && (
                    <Select value={m.seriesType} onValueChange={v => patchMeasure(m.id, { seriesType: v as SeriesType })}>
                      <SelectTrigger className="h-7 text-xs w-16 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SERIES_TYPE_OPTIONS.map(st => <SelectItem key={st.value} value={st.value} className="text-xs">{st.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {/* Remove */}
                  <Button
                    size="icon" variant="ghost"
                    className="size-7 shrink-0 hover:text-destructive"
                    onClick={() => removeMeasure(m.id)}
                    disabled={measures.length === 1}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              ))}
              {measures.length === 0 && (
                <p className="text-[10px] text-muted-foreground/50 italic py-1">Drop a measure field here</p>
              )}
            </DropZone>
          </div>

          {/* Group By Zone */}
          {uiCfg.showGroupBy && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Group By <span className="normal-case font-normal">(creates series{chartType === 'heatmap' ? ' / Y axis' : ''})</span>
              </p>
              <DropZone
                isOver={dragOverZone === 'group'}
                {...makeZoneHandlers('group', col => {
                  setGroupBy(col.name);
                  // do NOT remove measures — user keeps all Y-axis fields
                })}
                className="p-2 min-h-[36px]"
              >
                {groupBy ? (
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-amber-400 shrink-0" />
                    <span className="text-xs font-mono flex-1 truncate">{groupBy}</span>
                    <button onClick={() => setGroupBy('')} className="text-muted-foreground hover:text-destructive">
                      <X className="size-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground/50 italic">drop here or</span>
                    <Select
                      value={groupBy || '__none__'}
                      onValueChange={v => {
                        const val = v === '__none__' ? '' : v;
                        setGroupBy(val);
                        // do NOT remove measures — user keeps all Y-axis fields
                      }}
                    >
                      <SelectTrigger className="h-6 text-xs flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" className="text-xs text-muted-foreground">— None —</SelectItem>
                        {columns.filter(c => c.name !== xField).map(c => <SelectItem key={c.name} value={c.name} className="text-xs font-mono">{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </DropZone>
              {groupBy && measures.length > 1 && (
                <p className="text-[9px] text-amber-500/70 mt-1">
                  Group By pivots on the first Y-axis field. Remove Group By to use all fields independently.
                </p>
              )}
            </div>
          )}

          {/* Options row: Sort + Labels */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Sort order */}
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="size-3 text-muted-foreground shrink-0" />
              <Select value={sortOrder} onValueChange={v => setSortOrder(v as SortOrder)}>
                <SelectTrigger className="h-7 text-xs w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default" className="text-xs">Default order</SelectItem>
                  <SelectItem value="asc"     className="text-xs">Sort A → Z</SelectItem>
                  <SelectItem value="desc"    className="text-xs">Sort Z → A</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Data labels toggle */}
            <button
              onClick={() => setShowLabels(v => !v)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-colors ${
                showLabels ? 'bg-accent/20 border-accent/50 text-accent' : 'border-border/60 text-muted-foreground hover:border-accent/40'
              }`}
            >
              <Tag className="size-3" /> Labels
            </button>
          </div>

          {/* Run button (DB only) */}
          {sourceType === 'database' && (
            <Button
              className="w-full gap-2 h-8"
              size="sm"
              onClick={buildChart}
              disabled={!isReady || running}
            >
              {running
                ? <><Loader2 className="size-3.5 animate-spin" /> Running…</>
                : <><Play className="size-3.5" /> Run Query</>
              }
            </Button>
          )}
          {runError && (
            <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">{runError}</p>
          )}
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <Filter className="size-3" />
            Filters
            {filters.length > 0 && (
              <span className="inline-flex items-center justify-center size-4 rounded-full bg-accent text-accent-foreground text-[9px] font-bold leading-none">{filters.length}</span>
            )}
          </p>
          <button
            onClick={() => setFilters(prev => [...prev, { id: newFilterId(), column: '', operator: '=', value: '' }])}
            className="h-6 px-2.5 rounded-full text-[10px] font-medium border border-dashed border-border/50 text-muted-foreground hover:border-accent/60 hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Plus className="size-2.5" /> Add
          </button>
        </div>

        {filters.length === 0 ? (
          <p className="text-[10px] text-muted-foreground/40 italic">No filters — all data rows included</p>
        ) : (
          <div className="space-y-1.5">
            {filters.map(f => (
              <div key={f.id} className="grid grid-cols-[1fr_auto_1fr_auto] gap-1.5 items-center bg-secondary/15 rounded-lg px-2 py-1.5 border border-border/30">
                <Select value={f.column || '__none__'} onValueChange={v => setFilters(prev => prev.map(x => x.id === f.id ? { ...x, column: v === '__none__' ? '' : v } : x))}>
                  <SelectTrigger className="h-6 text-[10px] min-w-0 border-none bg-secondary/50 rounded-md shadow-none focus:ring-0">
                    <SelectValue placeholder="Column…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="text-xs text-muted-foreground">Column…</SelectItem>
                    {columns.map(c => <SelectItem key={c.name} value={c.name} className="text-xs font-mono">{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={f.operator} onValueChange={v => setFilters(prev => prev.map(x => x.id === f.id ? { ...x, operator: v as ChartFilter['operator'] } : x))}>
                  <SelectTrigger className="h-6 text-[10px] w-[72px] shrink-0 border-none bg-accent/15 text-accent rounded-md shadow-none focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FILTER_OPERATORS.map(op => <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {f.operator !== 'is_empty' && f.operator !== 'is_not_empty' ? (
                  <Input
                    value={f.value}
                    onChange={e => setFilters(prev => prev.map(x => x.id === f.id ? { ...x, value: e.target.value } : x))}
                    className="h-6 text-[10px] min-w-0 border-none bg-secondary/50 rounded-md shadow-none"
                    placeholder="value…"
                  />
                ) : (
                  <div />
                )}
                <button
                  onClick={() => setFilters(prev => prev.filter(x => x.id !== f.id))}
                  className="size-5 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            <p className="text-[9px] text-muted-foreground/40 italic">
              {sourceType === 'file' ? 'Applied before aggregation.' : 'Added to SQL WHERE clause.'}
            </p>
          </div>
        )}
      </div>

      {/* ── Preview ────────────────────────────────────────────────────────── */}
      {preview ? (
        <div className="rounded-xl border border-border/40 bg-black/20 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground truncate">{preview.title}</p>
            <div className="flex gap-1.5 text-[9px] text-muted-foreground shrink-0 ml-2 flex-wrap justify-end">
              <span className="bg-accent/10 text-accent px-1.5 py-0.5 rounded font-mono">{preview.chartType}</span>
              <span>{preview.data.length} rows</span>
              {preview.series.length > 1 && <span>{preview.series.length} series</span>}
              {preview.filters?.length ? <span className="text-accent">{preview.filters.length} filter{preview.filters.length > 1 ? 's' : ''}</span> : null}
            </div>
          </div>
          <ChartRenderer config={preview} height={220} />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/40 flex flex-col items-center justify-center h-44 text-muted-foreground gap-2">
          {running
            ? <><Loader2 className="size-5 animate-spin" /><p className="text-xs">Building chart…</p></>
            : sourceType === 'database'
              ? <p className="text-xs">Configure fields above and click <strong>Run Query</strong></p>
              : <p className="text-xs">Select a column to see a live preview</p>
          }
        </div>
      )}
    </div>
  );
}

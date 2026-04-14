"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Plus, X, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartRenderer } from "@/components/chart-renderer";
import type { GeneratedChartConfig, ChartType, ChartSeries } from "@/ai/flows/chart-generation";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Column { name: string; type: string; }

type AggFunc = 'none' | 'sum' | 'avg' | 'count' | 'count_distinct' | 'min' | 'max';
type SeriesType = 'bar' | 'line' | 'area';

interface MeasureConfig {
  id: string;
  field: string;
  agg: AggFunc;
  seriesType: SeriesType; // used only for composed chart
}

export interface ManualChartBuilderProps {
  columns: Column[];
  rows: any[];                 // populated for file sources, [] for DB
  sourceType: 'database' | 'file';
  connectionId?: string;       // DB only
  tableName?: string;          // DB only
  dbType?: string;             // 'postgresql' | 'mysql' | …
  onGenerate: (config: GeneratedChartConfig, title: string) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHART_COLORS = ['#6366f1', '#22d3ee', '#a3e635', '#f59e0b', '#ef4444', '#8b5cf6'];

const AGG_OPTIONS: { value: AggFunc; label: string }[] = [
  { value: 'sum',            label: 'SUM' },
  { value: 'avg',            label: 'AVG' },
  { value: 'count',          label: 'COUNT' },
  { value: 'count_distinct', label: 'COUNT DISTINCT' },
  { value: 'min',            label: 'MIN' },
  { value: 'max',            label: 'MAX' },
  { value: 'none',           label: 'No Aggregation' },
];

const SERIES_TYPE_OPTIONS: { value: SeriesType; label: string }[] = [
  { value: 'bar',  label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
];

const CHART_TYPES: { type: ChartType; label: string; group: string }[] = [
  { type: 'bar',           label: 'Bar',         group: 'Comparison' },
  { type: 'horizontal_bar',label: 'H. Bar',      group: 'Comparison' },
  { type: 'stacked_bar',   label: 'Stacked Bar', group: 'Comparison' },
  { type: 'line',          label: 'Line',        group: 'Trend' },
  { type: 'area',          label: 'Area',        group: 'Trend' },
  { type: 'pie',           label: 'Pie',         group: 'Part-to-Whole' },
  { type: 'donut',         label: 'Donut',       group: 'Part-to-Whole' },
  { type: 'treemap',       label: 'Treemap',     group: 'Part-to-Whole' },
  { type: 'funnel',        label: 'Funnel',      group: 'Sequential' },
  { type: 'scatter',       label: 'Scatter',     group: 'Correlation' },
  { type: 'radar',         label: 'Radar',       group: 'Multi-Metric' },
  { type: 'radial_bar',    label: 'Radial Bar',  group: 'Progress' },
  { type: 'composed',      label: 'Composed',    group: 'Advanced' },
];

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
  return Number(groupRows[0]?.[field] ?? 0); // none
}

function measureDataKey(m: MeasureConfig): string {
  return m.agg === 'none' ? m.field : `${m.field}__${m.agg}`;
}

function measureDisplayName(m: MeasureConfig): string {
  if (m.agg === 'none') return m.field;
  const label = AGG_OPTIONS.find(a => a.value === m.agg)?.label ?? m.agg.toUpperCase();
  return `${label}(${m.field})`;
}

/** Build chart data from in-memory rows (file source). */
function buildFileData(
  rows: any[],
  xField: string,
  measures: MeasureConfig[],
  groupBy: string,
): { data: any[]; series: ChartSeries[] } {
  if (!xField || measures.length === 0 || measures[0].field === '') return { data: [], series: [] };

  if (!groupBy) {
    // Group by xField only → one row per x value
    const buckets = new Map<string, any[]>();
    for (const row of rows) {
      const k = String(row[xField] ?? '(blank)');
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(row);
    }
    const data = Array.from(buckets).map(([xVal, bRows]) => {
      const entry: any = { [xField]: xVal };
      for (const m of measures) {
        entry[measureDataKey(m)] = aggValue(bRows, m.field, m.agg);
      }
      return entry;
    });
    const series: ChartSeries[] = measures.map((m, i) => ({
      dataKey: measureDataKey(m),
      name: measureDisplayName(m),
      color: CHART_COLORS[i % CHART_COLORS.length],
      seriesType: m.seriesType,
    }));
    return { data, series };
  }

  // Group by (xField, groupBy) → pivot groupBy values into separate series columns.
  // Only the first measure is used when group-by is active.
  const m = measures[0];
  const buckets2 = new Map<string, Map<string, any[]>>();
  const seriesSet = new Set<string>();

  for (const row of rows) {
    const xVal = String(row[xField] ?? '(blank)');
    const gVal = String(row[groupBy] ?? '(blank)');
    seriesSet.add(gVal);
    if (!buckets2.has(xVal)) buckets2.set(xVal, new Map());
    const inner = buckets2.get(xVal)!;
    if (!inner.has(gVal)) inner.set(gVal, []);
    inner.get(gVal)!.push(row);
  }

  const seriesNames = Array.from(seriesSet).sort();
  const data = Array.from(buckets2).map(([xVal, innerMap]) => {
    const entry: any = { [xField]: xVal };
    for (const gVal of seriesNames) {
      entry[gVal] = aggValue(innerMap.get(gVal) || [], m.field, m.agg);
    }
    return entry;
  });
  const series: ChartSeries[] = seriesNames.map((gVal, i) => ({
    dataKey: gVal,
    name: gVal,
    color: CHART_COLORS[i % CHART_COLORS.length],
    seriesType: m.seriesType,
  }));

  return { data, series };
}

/** Generate a SQL SELECT string for database sources. */
function buildSql(
  tableName: string,
  xField: string,
  measures: MeasureConfig[],
  groupBy: string,
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
  if (hasAgg) {
    const groupCols = [q(xField), ...(groupBy ? [q(groupBy)] : [])].join(', ');
    sql += ` GROUP BY ${groupCols}`;
  }
  sql += ` ORDER BY ${q(xField)} LIMIT 500`;
  return sql;
}

/** Pivot flat DB rows when a group-by was applied (one column per group value). */
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

// ── Counter for stable IDs ────────────────────────────────────────────────────
let _id = 0;
const newId = () => `m${++_id}`;

// ── Component ─────────────────────────────────────────────────────────────────

export function ManualChartBuilder({
  columns,
  rows,
  sourceType,
  connectionId,
  tableName,
  dbType,
  onGenerate,
}: ManualChartBuilderProps) {
  const dimensions = useMemo(() => columns.filter(c => !isNumericType(c.type)), [columns]);
  const numericCols = useMemo(() => columns.filter(c => isNumericType(c.type)), [columns]);

  const [chartType, setChartType] = useState<ChartType>('bar');
  const [xField, setXField]       = useState('');
  const [measures, setMeasures]   = useState<MeasureConfig[]>([
    { id: newId(), field: '', agg: 'sum', seriesType: 'bar' },
  ]);
  const [groupBy,  setGroupBy]    = useState('');
  const [preview,  setPreview]    = useState<GeneratedChartConfig | null>(null);
  const [running,  setRunning]    = useState(false);
  const [runError, setRunError]   = useState('');

  // Auto-seed defaults once columns arrive
  useEffect(() => {
    if (columns.length === 0) return;
    setXField(prev => prev || dimensions[0]?.name || columns[0]?.name || '');
    setMeasures(prev => {
      if (prev[0].field !== '') return prev;
      return [{ ...prev[0], field: numericCols[0]?.name || columns[0]?.name || '' }];
    });
  }, [columns]); // eslint-disable-line

  const isReady = Boolean(xField && measures.length > 0 && measures[0].field);

  const addMeasure = () => {
    if (measures.length >= 6) return;
    setMeasures(prev => [...prev, {
      id: newId(),
      field: numericCols[0]?.name || columns[0]?.name || '',
      agg: 'sum',
      seriesType: 'bar',
    }]);
  };

  const removeMeasure = (id: string) => {
    setMeasures(prev => prev.length > 1 ? prev.filter(m => m.id !== id) : prev);
  };

  const patchMeasure = (id: string, patch: Partial<MeasureConfig>) =>
    setMeasures(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));

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
        const r = buildFileData(rows, xField, measures, groupBy);
        data   = r.data;
        series = r.series;
      } else {
        // Database: generate SQL → execute via API
        sql = buildSql(tableName || '', xField, measures, groupBy, dbType);
        const res = await fetch('/api/dashboards/refresh-widget', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId, sql }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Query failed');

        const dbRows: any[] = json.data.rows;
        if (groupBy && measures.length > 0) {
          const dk = measureDataKey(measures[0]);
          const p  = pivotDbRows(dbRows, xField, groupBy, dk);
          data   = p.data;
          series = p.series;
        } else {
          data   = dbRows;
          series = measures.map((m, i) => ({
            dataKey: measureDataKey(m),
            name: measureDisplayName(m),
            color: CHART_COLORS[i % CHART_COLORS.length],
            seriesType: m.seriesType,
          }));
        }
      }

      const title = autoTitle(chartType, xField, measures, groupBy);
      const config: GeneratedChartConfig = {
        chartType,
        title,
        xKey: xField,
        series,
        data,
        sql,
      };
      setPreview(config);
      onGenerate(config, title);
    } catch (err: any) {
      setRunError(err.message || 'Failed to build chart');
    }

    setRunning(false);
  }, [isReady, sourceType, rows, xField, measures, groupBy, chartType, connectionId, tableName, dbType, onGenerate]);

  // Auto-update preview for file sources
  useEffect(() => {
    if (sourceType !== 'file' || !isReady) return;
    const t = setTimeout(buildChart, 250);
    return () => clearTimeout(t);
  }, [sourceType, isReady, xField, JSON.stringify(measures), groupBy, chartType]); // eslint-disable-line

  const groups = Array.from(new Set(CHART_TYPES.map(c => c.group)));

  return (
    <div className="space-y-4">

      {/* ── Chart type selector ─────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        {groups.map(grp => (
          <div key={grp} className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase w-20 shrink-0">{grp}</span>
            {CHART_TYPES.filter(c => c.group === grp).map(ct => (
              <button
                key={ct.type}
                onClick={() => setChartType(ct.type)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
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

      {/* ── Fields + Configuration ──────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-4">

        {/* Left: field list */}
        <div className="col-span-2 rounded-lg border border-border/40 bg-black/10 p-3 space-y-3 overflow-y-auto max-h-64">
          <div>
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
              Dimensions <span className="normal-case font-normal">({dimensions.length})</span>
            </p>
            {dimensions.length === 0
              ? <p className="text-xs text-muted-foreground italic">None</p>
              : dimensions.map(c => (
                  <div key={c.name} className="flex items-center gap-1.5 py-0.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                    <span className="text-[11px] font-mono truncate flex-1">{c.name}</span>
                    <span className="text-[9px] text-muted-foreground">{c.type}</span>
                  </div>
                ))
            }
          </div>
          <div>
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
              Measures <span className="normal-case font-normal">({numericCols.length})</span>
            </p>
            {numericCols.length === 0
              ? <p className="text-xs text-muted-foreground italic">None</p>
              : numericCols.map(c => (
                  <div key={c.name} className="flex items-center gap-1.5 py-0.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-400 shrink-0" />
                    <span className="text-[11px] font-mono truncate flex-1">{c.name}</span>
                    <span className="text-[9px] text-muted-foreground">{c.type}</span>
                  </div>
                ))
            }
          </div>
        </div>

        {/* Right: configuration shelves */}
        <div className="col-span-3 space-y-3">

          {/* X-Axis / Category */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
              X-Axis / Category
            </label>
            <Select value={xField || '__x_none__'} onValueChange={v => setXField(v === '__x_none__' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select column…" />
              </SelectTrigger>
              <SelectContent>
                {columns.length === 0 && (
                  <SelectItem value="__x_none__" disabled className="text-xs text-muted-foreground">No columns available</SelectItem>
                )}
                {columns.map(c => (
                  <SelectItem key={c.name} value={c.name} className="text-xs font-mono">{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Y-Axis / Values */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Y-Axis / Values
              </label>
              {measures.length < 6 && (
                <Button
                  size="sm" variant="ghost"
                  className="h-6 px-2 text-[10px] gap-1"
                  onClick={addMeasure}
                  disabled={!!groupBy}
                  title={groupBy ? 'Remove Group By to add multiple measures' : undefined}
                >
                  <Plus className="size-3" /> Add
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              {measures.map((m, idx) => (
                <div key={m.id} className="flex gap-1.5 items-center">
                  {/* Field */}
                  <Select
                    value={m.field || '__m_none__'}
                    onValueChange={v => patchMeasure(m.id, { field: v === '__m_none__' ? '' : v })}
                  >
                    <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                      <SelectValue placeholder="Column…" />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.length === 0 && (
                        <SelectItem value="__m_none__" disabled className="text-xs text-muted-foreground">No columns</SelectItem>
                      )}
                      {columns.map(c => (
                        <SelectItem key={c.name} value={c.name} className="text-xs font-mono">{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Aggregation */}
                  <Select value={m.agg} onValueChange={v => patchMeasure(m.id, { agg: v as AggFunc })}>
                    <SelectTrigger className="h-8 text-xs w-32 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGG_OPTIONS.map(a => (
                        <SelectItem key={a.value} value={a.value} className="text-xs">{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Series type (composed only) */}
                  {chartType === 'composed' && (
                    <Select value={m.seriesType} onValueChange={v => patchMeasure(m.id, { seriesType: v as SeriesType })}>
                      <SelectTrigger className="h-8 text-xs w-20 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SERIES_TYPE_OPTIONS.map(st => (
                          <SelectItem key={st.value} value={st.value} className="text-xs">{st.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {/* Remove */}
                  <Button
                    size="icon" variant="ghost"
                    className="size-8 shrink-0 hover:text-destructive"
                    onClick={() => removeMeasure(m.id)}
                    disabled={measures.length === 1}
                    title={idx === 0 ? undefined : 'Remove measure'}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Group By / Color */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
              Group By <span className="normal-case font-normal text-muted-foreground">(creates series)</span>
            </label>
            {/* Radix UI Select does not allow value="" — use "__none__" as sentinel */}
            <Select
              value={groupBy || '__none__'}
              onValueChange={v => {
                const val = v === '__none__' ? '' : v;
                setGroupBy(val);
                if (val) setMeasures(prev => prev.slice(0, 1));
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs text-muted-foreground">— None —</SelectItem>
                {columns.filter(c => c.name !== xField).map(c => (
                  <SelectItem key={c.name} value={c.name} className="text-xs font-mono">{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Run button (DB only) */}
          {sourceType === 'database' && (
            <Button
              className="w-full gap-2"
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

      {/* ── Preview ─────────────────────────────────────────────────────────── */}
      {preview ? (
        <div className="rounded-xl border border-border/40 bg-black/20 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground truncate">{preview.title}</p>
            <div className="flex gap-2 text-[9px] text-muted-foreground shrink-0 ml-2">
              <span className="bg-accent/10 text-accent px-1.5 py-0.5 rounded font-mono">{preview.chartType}</span>
              <span>{preview.data.length} rows</span>
              {preview.series.length > 1 && <span>{preview.series.length} series</span>}
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

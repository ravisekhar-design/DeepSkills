/**
 * LAYER: Worksheet (Chart Builder)
 * A worksheet is a saved chart with shelves, marks, and chart-specific options.
 * Bound to a SemanticModel.
 */

import type { AggFunc, FieldRole, DataType } from '@/lib/semantic/types';

export type ChartType =
  | 'bar' | 'horizontal_bar' | 'stacked_bar'
  | 'line' | 'area' | 'pie' | 'donut'
  | 'scatter' | 'bubble' | 'kpi' | 'table'
  | 'heatmap' | 'treemap'
  | 'radar' | 'waterfall' | 'funnel' | 'gauge'
  | 'radial_bar' | 'histogram' | 'composed' | 'sankey';

export interface ShelfPill {
  fieldName: string;        // backing field (or calc field) name
  displayName: string;
  role: FieldRole;          // dimension or measure
  dataType: DataType;
  aggregation?: AggFunc;    // for measures
  binning?: { type: 'count' | 'width'; n: number };  // for histograms
  dateUnit?: 'year' | 'quarter' | 'month' | 'week' | 'day';
  sort?: 'asc' | 'desc';
  alias?: string;           // display alias
}

export type FilterMode = 'in' | 'range' | 'condition';

export interface FilterPill {
  fieldName: string;
  displayName: string;
  role: FieldRole;
  dataType: DataType;
  filterMode: FilterMode;
  // mode = 'in'
  values?: string[];
  // mode = 'range'
  min?: number;
  max?: number;
  // mode = 'condition'
  operator?: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'is_null' | 'is_not_null';
  value?: string;
}

export interface MarksCard {
  color?: ShelfPill;
  size?: ShelfPill;
  label?: ShelfPill;
  tooltip?: ShelfPill[];
}

export interface WorksheetOptions {
  stacked?: boolean;
  showLabels?: boolean;
  showLegend?: boolean;
  showGrid?: boolean;
  rowLimit?: number;
  // KPI-specific
  kpiFormat?: string;
  // Color palette
  palette?: string[];
}

export interface WorksheetConfig {
  chartType: ChartType;
  columns: ShelfPill[];   // X axis dimensions (or measures for horizontal_bar)
  rows: ShelfPill[];      // Y axis measures (or dimensions for horizontal_bar)
  filters: FilterPill[];
  marks: MarksCard;
  options: WorksheetOptions;
}

export interface Worksheet {
  id: string;
  modelId?: string;
  name: string;
  description?: string;
  config: WorksheetConfig;
  cachedData?: { columns: any[]; rows: Record<string, unknown>[] };
  cachedAt?: number;
  createdAt: number;
  updatedAt: number;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export function defaultConfig(): WorksheetConfig {
  return {
    chartType: 'bar',
    columns: [],
    rows: [],
    filters: [],
    marks: {},
    options: {
      showLabels: false,
      showLegend: true,
      showGrid: true,
      rowLimit: 1000,
    },
  };
}

// ── Helper: convert WorksheetConfig → SemanticQuery ───────────────────────────

import type { SemanticQuery, QueryDimension, QueryMeasure, QueryFilter } from '@/lib/semantic/types';

export function configToSemanticQuery(cfg: WorksheetConfig): SemanticQuery {
  // For horizontal_bar, swap roles: rows become dimensions, columns become measures
  const isHoriz = cfg.chartType === 'horizontal_bar';
  const dimSource = isHoriz ? cfg.rows : cfg.columns;
  const measSource = isHoriz ? cfg.columns : cfg.rows;

  // Marks color/size of dimension type also count as group dimensions
  const marksDims: ShelfPill[] = [];
  if (cfg.marks.color && cfg.marks.color.role === 'dimension') marksDims.push(cfg.marks.color);

  const dimensions: QueryDimension[] = [...dimSource, ...marksDims]
    .filter(p => p.role === 'dimension')
    .map(p => ({
      field: p.fieldName,
      binning: p.binning,
      dateUnit: p.dateUnit,
      sort: p.sort,
    }));

  const measures: QueryMeasure[] = measSource
    .filter(p => p.role === 'measure')
    .map(p => ({
      field: p.fieldName,
      agg: p.aggregation ?? 'sum',
      alias: p.alias || `${p.aggregation ?? 'sum'}_${p.fieldName}`,
    }));

  const filters: QueryFilter[] = cfg.filters.map(f => {
    if (f.filterMode === 'in') return { field: f.fieldName, op: 'in' as const, values: f.values ?? [] };
    if (f.filterMode === 'range') return { field: f.fieldName, op: 'between' as const, min: f.min, max: f.max };
    return { field: f.fieldName, op: (f.operator ?? '=') as any, value: f.value };
  });

  return {
    dimensions,
    measures,
    filters,
    rowLimit: cfg.options.rowLimit,
  };
}

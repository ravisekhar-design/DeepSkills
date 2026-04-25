/**
 * LAYER: Semantic Model
 * Defines business-friendly structure over raw data sources.
 * Like Tableau's data model layer — splits fields into dimensions vs measures,
 * detects types, sets default aggregations, and supports calculated fields + hierarchies.
 */

export type DataType = 'string' | 'number' | 'date' | 'boolean';
export type FieldRole = 'dimension' | 'measure';
export type AggFunc = 'sum' | 'avg' | 'count' | 'count_distinct' | 'min' | 'max' | 'none';

export interface FieldDef {
  name: string;          // raw column name
  displayName: string;   // user-friendly name
  dataType: DataType;
  role: FieldRole;
  defaultAgg?: AggFunc;  // for measures
  format?: string;       // e.g. "$#,##0.00", "0.0%", "yyyy-MM-dd"
  description?: string;
  hidden?: boolean;
  folder?: string;       // optional grouping
}

export interface CalcField {
  id: string;
  name: string;
  displayName: string;
  expression: string;    // simple math: "price * quantity"
  dataType: DataType;
  role: FieldRole;
  defaultAgg?: AggFunc;
  description?: string;
}

export interface Hierarchy {
  id: string;
  name: string;
  fields: string[];      // ordered: ["country", "state", "city"]
}

export type SemanticSourceType = 'database' | 'prepared_dataset' | 'file';

export interface SemanticModel {
  id: string;
  name: string;
  description?: string;
  sourceType: SemanticSourceType;
  sourceId: string;
  sourceName: string;
  sourceTable?: string;
  sourceSql?: string;
  fields: FieldDef[];
  calculations: CalcField[];
  hierarchies: Hierarchy[];
  createdAt: number;
  updatedAt: number;
}

// ── Query interface ──────────────────────────────────────────────────────────

export interface QueryDimension {
  field: string;          // field name (or calc field name)
  binning?: { type: 'count' | 'width'; n: number };  // for histograms
  dateUnit?: 'year' | 'quarter' | 'month' | 'week' | 'day';  // date binning
  sort?: 'asc' | 'desc';
  limit?: number;         // top-N
}

export interface QueryMeasure {
  field: string;          // field name (or calc field name)
  agg: AggFunc;
  alias?: string;
}

export type FilterOp =
  | '=' | '!=' | '>' | '<' | '>=' | '<='
  | 'in' | 'not_in' | 'contains' | 'between' | 'is_null' | 'is_not_null';

export interface QueryFilter {
  field: string;
  op: FilterOp;
  value?: string | number;
  values?: (string | number)[];
  min?: number;
  max?: number;
}

export interface SemanticQuery {
  dimensions: QueryDimension[];
  measures: QueryMeasure[];
  filters: QueryFilter[];
  rowLimit?: number;
}

export interface QueryResult {
  columns: { name: string; dataType: DataType; role: FieldRole }[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  executionMs: number;
}

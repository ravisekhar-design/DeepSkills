export type StepType = 'source' | 'filter' | 'rename' | 'aggregate' | 'join' | 'union' | 'output';

export interface ColumnSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'unknown';
}

export type FilterOperator =
  | '=' | '!=' | '>' | '<' | '>=' | '<='
  | 'contains' | 'not_contains' | 'is_null' | 'is_not_null';

export interface FilterCondition {
  id: string;
  column: string;
  operator: FilterOperator;
  value: string;
  logicOp: 'AND' | 'OR';
}

export interface RenameOp {
  column: string;
  newName?: string;
  newType?: 'string' | 'number' | 'boolean' | 'date';
  remove?: boolean;
}

export type AggFunc = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'count_distinct';

export interface AggregationOp {
  id: string;
  column: string;
  func: AggFunc;
  alias: string;
}

export interface JoinCondition {
  id: string;
  leftCol: string;
  rightCol: string;
}

export type JoinType = 'inner' | 'left' | 'right' | 'full';

// ── Step Configs ──────────────────────────────────────────────────────────────

export interface SourceConfig {
  type: 'source';
  connectionId: string;
  connectionName: string;
  sql: string;
}

export interface FilterConfig {
  type: 'filter';
  conditions: FilterCondition[];
}

export interface RenameConfig {
  type: 'rename';
  operations: RenameOp[];
}

export interface AggregateConfig {
  type: 'aggregate';
  groupBy: string[];
  aggregations: AggregationOp[];
}

export interface JoinConfig {
  type: 'join';
  joinType: JoinType;
  rightConnectionId: string;
  rightConnectionName: string;
  rightSql: string;
  conditions: JoinCondition[];
}

export interface UnionConfig {
  type: 'union';
  rightConnectionId: string;
  rightConnectionName: string;
  rightSql: string;
  all: boolean;
}

export interface OutputConfig {
  type: 'output';
  name: string;
  description?: string;
}

export type StepConfig =
  | SourceConfig
  | FilterConfig
  | RenameConfig
  | AggregateConfig
  | JoinConfig
  | UnionConfig
  | OutputConfig;

export interface PrepStep {
  id: string;
  config: StepConfig;
}

// ── Domain types ──────────────────────────────────────────────────────────────

export interface DataPrepFlow {
  id: string;
  name: string;
  description?: string;
  steps: PrepStep[];
  createdAt: number;
  updatedAt: number;
}

export interface PreparedDataset {
  id: string;
  flowId: string;
  name: string;
  description?: string;
  schema: ColumnSchema[];
  sampleRows: Record<string, unknown>[];
  rowCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface StepPreviewResult {
  schema: ColumnSchema[];
  rows: Record<string, unknown>[];
  rowCount: number;
  error?: string;
}

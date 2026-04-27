/**
 * Pure helpers / types for the AI worksheet builder.
 *
 * Lives outside `src/ai/flows/` because Next.js Server Action modules
 * (`'use server'`) require every export to be an async function. The sync
 * helper and the result type live here so the worksheet page can import them
 * from a client component without dragging server-only code into the bundle.
 */

import { defaultConfig } from './types';
import type { WorksheetConfig, ChartType, ShelfPill } from './types';
import type { SemanticModel, AggFunc, FieldRole, DataType } from '@/lib/semantic/types';

/**
 * Result of `generateWorksheetSuggestion`. Mirrors the zod schema in the
 * server action — kept hand-written here so this module has no zod runtime
 * dependency and can be imported from client components.
 */
export interface AIWorksheetSuggestion {
  chartType: ChartType;
  columns: Array<{
    fieldName: string;
    aggregation?: AggFunc;
    dateUnit?: 'year' | 'quarter' | 'month' | 'week' | 'day';
  }>;
  rows: Array<{
    fieldName: string;
    aggregation?: AggFunc;
    dateUnit?: 'year' | 'quarter' | 'month' | 'week' | 'day';
  }>;
  reasoning: string;
  alternatives?: Array<{ chartType: ChartType; label: string }>;
}

function pillFromField(
  fieldName: string,
  agg: AggFunc | undefined,
  dateUnit: 'year' | 'quarter' | 'month' | 'week' | 'day' | undefined,
  model: SemanticModel,
): ShelfPill | null {
  const field = model.fields.find(f => f.name === fieldName)
    || model.calculations.find(c => c.name === fieldName);
  if (!field) return null;
  return {
    fieldName: field.name,
    displayName: field.displayName,
    role: field.role as FieldRole,
    dataType: field.dataType as DataType,
    aggregation: field.role === 'measure' ? (agg ?? 'sum') : undefined,
    dateUnit: field.role === 'dimension' && field.dataType === 'date'
      ? (dateUnit ?? 'month')
      : undefined,
  };
}

/**
 * Convert an AI suggestion into a fully-formed WorksheetConfig that drops
 * straight into the manual builder.
 */
export function applySuggestionToConfig(
  suggestion: AIWorksheetSuggestion,
  model: SemanticModel,
): WorksheetConfig {
  const base = defaultConfig();
  return {
    ...base,
    chartType: suggestion.chartType,
    columns: suggestion.columns
      .map(f => pillFromField(f.fieldName, f.aggregation, f.dateUnit, model))
      .filter(Boolean) as ShelfPill[],
    rows: suggestion.rows
      .map(f => pillFromField(f.fieldName, f.aggregation, f.dateUnit, model))
      .filter(Boolean) as ShelfPill[],
  };
}

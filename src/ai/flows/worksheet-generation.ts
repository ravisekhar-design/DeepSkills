'use server';
/**
 * AI-powered worksheet generation — server action.
 *
 * Given a SemanticModel's fields and a natural-language prompt, returns an
 * `AIWorksheetSuggestion`. The non-async helpers and the result type live in
 * `@/lib/worksheet/ai-suggestion` because every export from a `'use server'`
 * module must be an async function — that's the contract Next.js enforces in
 * Turbopack builds. Splitting them keeps this file as a clean server-only
 * surface.
 */

import { z } from 'zod';
import { getLangChainModel } from '../langchain';
import type { AIWorksheetSuggestion } from '@/lib/worksheet/ai-suggestion';

// ── Output schema ─────────────────────────────────────────────────────────────

const ShelfFieldSchema = z.object({
  fieldName: z.string().describe('Name of the field as it appears in the semantic model.'),
  aggregation: z.enum(['sum', 'avg', 'count', 'count_distinct', 'min', 'max'])
    .optional()
    .describe('Aggregation function — only set for measure fields.'),
  dateUnit: z.enum(['year', 'quarter', 'month', 'week', 'day'])
    .optional()
    .describe('Date binning unit — only set for date dimensions.'),
});

const AISuggestionSchema = z.object({
  chartType: z.enum([
    'bar', 'horizontal_bar', 'stacked_bar',
    'line', 'area', 'pie', 'donut',
    'scatter', 'bubble', 'kpi', 'table',
    'heatmap', 'treemap',
    'radar', 'waterfall', 'funnel', 'gauge',
    'radial_bar', 'histogram', 'composed', 'sankey',
  ]).describe('Best chart type for the prompt.'),
  columns: z.array(ShelfFieldSchema).describe('Fields for the X-axis (or Y for horizontal_bar).'),
  rows: z.array(ShelfFieldSchema).describe('Fields for the Y-axis (or X for horizontal_bar).'),
  reasoning: z.string().describe('One short sentence explaining why this chart fits the prompt.'),
  alternatives: z.array(z.object({
    chartType: z.enum([
      'bar', 'horizontal_bar', 'stacked_bar',
      'line', 'area', 'pie', 'donut',
      'scatter', 'bubble', 'treemap', 'radar',
    ]),
    label: z.string(),
  })).optional().describe('1-2 alternative visualization styles the user could pick.'),
});

// ── Prompt ────────────────────────────────────────────────────────────────────

const SYSTEM = `You are a data-visualization expert. The user will give you:
  1) A list of available fields with their role (dimension/measure), data type, and display name.
  2) A natural-language description of what they want to see.

Your job is to pick the best chart type, decide which fields belong on the
Columns shelf (X-axis) and which on the Rows shelf (Y-axis), and assign the
right aggregation to each measure.

Rules:
- Use only fieldName values from the provided list — never invent fields.
- Dimensions (categorical, date, boolean) go on Columns by default.
- Measures (numeric) go on Rows with an aggregation (sum is the safe default).
- For 'horizontal_bar', invert: dimensions on Rows, measures on Columns.
- For 'pie' / 'donut' / 'treemap' / 'funnel' / 'radial_bar' / 'gauge' / 'kpi':
    one dimension on Columns, one measure on Rows.
- For 'scatter': two measures on Rows (X and Y), no dimension on Columns.
- For 'bubble': three measures on Rows (X, Y, size).
- For 'line' / 'area': dimension (preferably a date) on Columns, 1+ measures on Rows.
- For 'sankey': two dimensions on Columns (source, target), one measure on Rows.
- For date dimensions on time-series charts, set dateUnit ('month' is a good default).
- Suggest 1-2 reasonable alternative chart types when applicable.

Return ONLY the structured object that matches the schema — no extra text.`;

// ── Server action ─────────────────────────────────────────────────────────────

export async function generateWorksheetSuggestion(input: {
  prompt: string;
  fields: Array<{ name: string; displayName: string; role: string; dataType: string }>;
  preferredModel?: string;
}): Promise<AIWorksheetSuggestion> {
  if (!input.prompt?.trim()) throw new Error('Prompt is required.');
  if (!input.fields?.length) throw new Error('Model has no fields to chart.');

  const model = await getLangChainModel(input.preferredModel);
  const structured = (model as any).withStructuredOutput(AISuggestionSchema);

  const fieldList = input.fields
    .map(f => `- ${f.name} (displayName="${f.displayName}", role=${f.role}, type=${f.dataType})`)
    .join('\n');

  const userMessage = `Available fields:
${fieldList}

User request: "${input.prompt}"`;

  const result = await structured.invoke([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: userMessage },
  ]);

  return result as AIWorksheetSuggestion;
}

'use server';
/**
 * AI-powered worksheet generation — server action.
 *
 * IMPORTANT: We cannot use LangChain's withStructuredOutput() here because
 * Google Gemini's schema parser rejects JSON Schema $ref nodes, and zod's
 * to-JSON-Schema serializer emits $ref any time a sub-schema is reused
 * (which it is for our shelf-field shape — used by both columns and rows).
 * The portable fix is the same one chart-generation.ts uses: prompt the
 * model for raw JSON and parse manually.
 */

import { getLangChainModel } from '../langchain';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { AIWorksheetSuggestion } from '@/lib/worksheet/ai-suggestion';
import type { ChartType } from '@/lib/worksheet/types';
import type { AggFunc } from '@/lib/semantic/types';

const VALID_CHART_TYPES: ChartType[] = [
  'bar', 'horizontal_bar', 'stacked_bar',
  'line', 'area', 'pie', 'donut',
  'scatter', 'bubble', 'kpi', 'table',
  'heatmap', 'treemap',
  'radar', 'waterfall', 'funnel', 'gauge',
  'radial_bar', 'histogram', 'composed', 'sankey',
];

const VALID_AGGS: AggFunc[] = ['sum', 'avg', 'count', 'count_distinct', 'min', 'max'];
const VALID_DATE_UNITS = ['year', 'quarter', 'month', 'week', 'day'] as const;

const SYSTEM = `You are a data-visualization expert. The user will give you:
  1) A list of available fields with their role (dimension/measure), data type, and display name.
  2) A natural-language description of what they want to see.

Pick the best chart type, decide which fields belong on Columns (X-axis)
and which on Rows (Y-axis), and assign aggregations to measures.

Respond with ONLY a JSON object matching this exact shape — no markdown,
no code fences, no commentary:

{
  "chartType": "<one of: bar | horizontal_bar | stacked_bar | line | area | pie | donut | scatter | bubble | kpi | table | heatmap | treemap | radar | waterfall | funnel | gauge | radial_bar | histogram | composed | sankey>",
  "columns": [
    { "fieldName": "<exact name from list>", "aggregation": "<sum|avg|count|count_distinct|min|max>" (only for measures), "dateUnit": "<year|quarter|month|week|day>" (only for date dimensions) }
  ],
  "rows": [
    { "fieldName": "...", "aggregation": "...", "dateUnit": "..." }
  ],
  "reasoning": "<one short sentence explaining the choice>",
  "alternatives": [
    { "chartType": "<chart type>", "label": "<short user-facing label>" }
  ]
}

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
- Suggest 1-2 reasonable alternative chart types when applicable.`;

// ── Sanitisation: trust nothing the model returned ────────────────────────────

function pickChartType(v: unknown): ChartType {
  return VALID_CHART_TYPES.includes(v as ChartType) ? (v as ChartType) : 'bar';
}

function sanitiseShelf(raw: any): AIWorksheetSuggestion['columns'] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(item => item && typeof item.fieldName === 'string')
    .map(item => ({
      fieldName: String(item.fieldName),
      aggregation: VALID_AGGS.includes(item.aggregation) ? item.aggregation : undefined,
      dateUnit: VALID_DATE_UNITS.includes(item.dateUnit) ? item.dateUnit : undefined,
    }));
}

function sanitiseAlternatives(raw: any): AIWorksheetSuggestion['alternatives'] {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter(item => item && VALID_CHART_TYPES.includes(item.chartType) && typeof item.label === 'string')
    .map(item => ({ chartType: item.chartType as ChartType, label: String(item.label) }))
    .slice(0, 3);
}

// ── Server action ─────────────────────────────────────────────────────────────

export async function generateWorksheetSuggestion(input: {
  prompt: string;
  fields: Array<{ name: string; displayName: string; role: string; dataType: string }>;
  preferredModel?: string;
}): Promise<AIWorksheetSuggestion> {
  if (!input.prompt?.trim()) throw new Error('Prompt is required.');
  if (!input.fields?.length) throw new Error('Model has no fields to chart.');

  const llm = await getLangChainModel(input.preferredModel);

  const fieldList = input.fields
    .map(f => `- ${f.name} (displayName="${f.displayName}", role=${f.role}, type=${f.dataType})`)
    .join('\n');

  const userMessage = `Available fields:
${fieldList}

User request: "${input.prompt}"`;

  const response = await (llm as any).invoke([
    new SystemMessage(SYSTEM),
    new HumanMessage(userMessage),
  ]);

  const text = typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content);

  // Models occasionally wrap JSON in code fences or add a sentence around it.
  // Grab the first {...} balanced span we can find.
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI did not return a JSON object. Try a more specific prompt.');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e: any) {
    throw new Error(`Could not parse AI response as JSON: ${e?.message ?? 'unknown'}`);
  }

  return {
    chartType: pickChartType(parsed.chartType),
    columns: sanitiseShelf(parsed.columns),
    rows: sanitiseShelf(parsed.rows),
    reasoning: typeof parsed.reasoning === 'string'
      ? parsed.reasoning
      : 'Generated from your prompt.',
    alternatives: sanitiseAlternatives(parsed.alternatives),
  };
}

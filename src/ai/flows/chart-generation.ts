'use server';
/**
 * AI-powered chart generation.
 * Given a data schema + sample + natural language prompt, returns a
 * ready-to-render Recharts configuration with data.
 */

import { getLangChainModel } from '../langchain';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export interface ChartSeries {
  dataKey: string;
  name: string;
  color: string;
}

export interface GeneratedChartConfig {
  chartType: 'bar' | 'line' | 'area' | 'pie';
  title: string;
  xKey: string;
  series: ChartSeries[];
  data: any[];
  sql: string | null;
}

const CHART_COLORS = ['#6366f1', '#22d3ee', '#a3e635', '#f59e0b', '#ef4444', '#8b5cf6'];

const SYSTEM = `You are a data visualization expert. Your job is to analyze a data schema and produce a chart configuration.

Respond ONLY with a valid JSON object — no markdown, no explanation, no code fences. The JSON must match this shape exactly:
{
  "chartType": "bar" | "line" | "area" | "pie",
  "title": "<descriptive chart title>",
  "sql": "<SELECT query>" | null,
  "xKey": "<column name for x-axis / category>",
  "series": [
    { "dataKey": "<column name>", "name": "<display label>", "color": "<hex color>" }
  ]
}

Rules:
- For database sources, generate a SQL SELECT query that returns the data needed for the chart. Alias columns clearly. Keep it simple and compatible with the database type.
- For file sources, set sql to null. xKey and series dataKey values must be exact column names from the file.
- chartType: use "bar" for comparisons/categories, "line"/"area" for time series, "pie" for proportions.
- xKey must be a string/label column.
- series should contain the numeric column(s) to plot.
- Colors must be from: #6366f1, #22d3ee, #a3e635, #f59e0b, #ef4444, #8b5cf6.
- If the data has only one numeric column, use one series entry.
- SQL must be safe SELECT-only. Never use DROP, DELETE, UPDATE, INSERT.`;

export async function generateChart(input: {
  sourceType: 'database' | 'file';
  tableName: string;
  columns: Array<{ name: string; type: string }>;
  sampleRows: any[];
  prompt: string;
  dbType?: string;
  preferredModel?: string;
  // For file sources — full data rows (up to 200)
  allRows?: any[];
  // For database sources — run SQL after generating it
  connectionId?: string;
  userId?: string;
}): Promise<GeneratedChartConfig> {
  const model = await getLangChainModel(input.preferredModel);

  const columnList = input.columns.map(c => `${c.name} (${c.type})`).join(', ');
  const sampleJson = JSON.stringify(input.sampleRows.slice(0, 5), null, 2);

  const userMessage = `Source type: ${input.sourceType}
Table/File name: ${input.tableName}
${input.dbType ? `Database type: ${input.dbType}` : ''}
Columns: ${columnList}

Sample data (first 5 rows):
${sampleJson}

User request: "${input.prompt}"`;

  const response = await (model as any).invoke([
    new SystemMessage(SYSTEM),
    new HumanMessage(userMessage),
  ]);

  const text = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

  // Extract JSON from response (strip any accidental markdown fences)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI did not return a valid chart configuration.');

  let config: any;
  try {
    config = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('Could not parse AI chart configuration as JSON.');
  }

  // Assign fallback colors if AI omitted them
  (config.series || []).forEach((s: any, i: number) => {
    if (!s.color) s.color = CHART_COLORS[i % CHART_COLORS.length];
  });

  // ── Fetch actual data ────────────────────────────────────────────────────
  let data: any[] = [];

  if (input.sourceType === 'database' && config.sql && input.connectionId && input.userId) {
    try {
      const { executeDbQuery } = await import('@/lib/db-connector');
      const result = await executeDbQuery(input.connectionId, input.userId, config.sql);
      data = result.rows;
    } catch (err: any) {
      throw new Error(`Failed to execute generated SQL: ${err.message}\nSQL: ${config.sql}`);
    }
  } else if (input.sourceType === 'file') {
    // Use pre-parsed rows from the file
    data = (input.allRows || input.sampleRows).slice(0, 200);
  }

  return {
    chartType: config.chartType || 'bar',
    title: config.title || input.tableName,
    xKey: config.xKey,
    series: config.series || [],
    data,
    sql: config.sql || null,
  };
}

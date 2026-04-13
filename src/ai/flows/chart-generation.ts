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
  seriesType?: 'bar' | 'line' | 'area'; // used by composed charts only
}

export type ChartType =
  | 'bar' | 'stacked_bar' | 'horizontal_bar'
  | 'line' | 'area'
  | 'pie' | 'donut'
  | 'scatter'
  | 'radar'
  | 'treemap'
  | 'funnel'
  | 'composed'
  | 'radial_bar';

export interface GeneratedChartConfig {
  chartType: ChartType;
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
  "chartType": <see below>,
  "title": "<descriptive chart title>",
  "sql": "<SELECT query>" | null,
  "xKey": "<column name for x-axis / category>",
  "series": [
    { "dataKey": "<column name>", "name": "<display label>", "color": "<hex color>", "seriesType": "bar"|"line"|"area" }
  ],
  "aggregation": {
    "groupBy": "<column to group by>",
    "metrics": [
      { "dataKey": "<output column name>", "sourceColumn": "<input column or '*'>", "func": "count"|"count_distinct"|"sum"|"avg" }
    ]
  } | null
}

Chart type rules — pick the BEST fit:
• "bar"           — compare discrete categories (vertical bars)
• "stacked_bar"   — compare multiple metrics per category + show totals
• "horizontal_bar"— ranked categories or long label names (horizontal bars)
• "line"          — trends over time (continuous x-axis)
• "area"          — cumulative / smooth time-series trends
• "pie"           — proportions with ≤ 8 categories
• "donut"         — proportions with center space (like pie but with hole)
• "scatter"       — correlation between TWO numeric variables
• "radar"         — compare multiple metrics across categories (spider chart)
• "treemap"       — proportional area, hierarchical data
• "funnel"        — sequential conversion stages / pipeline
• "composed"      — overlay bar + line for dual metrics on same axis
• "radial_bar"    — progress / achievement per category in polar form

Additional rules:
- For database sources: generate a SQL SELECT query that returns already-aggregated/ready data. Set aggregation to null. Alias columns clearly. Keep SQL simple and compatible with the database type.
- For file sources: set sql to null. If the user asks for grouping/counting/aggregation use the aggregation field. If no aggregation is needed, use exact column names.
- xKey: string/label column (exception: for scatter, xKey must be a NUMERIC column)
- series: numeric columns to plot. For composed, each series entry MUST include seriesType ("bar" or "line").
- For scatter: xKey is the X numeric column; series[0].dataKey is the Y numeric column.
- For radar: xKey is the category spoke label; series are the numeric metric columns.
- For treemap, funnel, radial_bar: xKey is the name/label; series[0].dataKey is the value.
- Colors must be from: #6366f1, #22d3ee, #a3e635, #f59e0b, #ef4444, #8b5cf6.
- SQL must be safe SELECT-only. Never use DROP, DELETE, UPDATE, INSERT.`;

interface AggMetric { dataKey: string; sourceColumn: string; func: 'count' | 'count_distinct' | 'sum' | 'avg' }
interface Aggregation { groupBy: string; metrics: AggMetric[] }

function applyAggregation(rows: any[], agg: Aggregation): any[] {
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const key = String(row[agg.groupBy] ?? '(blank)');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  const result: any[] = [];
  for (const [groupKey, groupRows] of groups) {
    const entry: any = { [agg.groupBy]: groupKey };
    for (const m of agg.metrics) {
      if (m.func === 'count') {
        entry[m.dataKey] = groupRows.length;
      } else if (m.func === 'count_distinct') {
        entry[m.dataKey] = new Set(groupRows.map((r: any) => r[m.sourceColumn])).size;
      } else if (m.func === 'sum') {
        entry[m.dataKey] = groupRows.reduce((acc: number, r: any) => acc + Number(r[m.sourceColumn] || 0), 0);
      } else if (m.func === 'avg') {
        const sum = groupRows.reduce((acc: number, r: any) => acc + Number(r[m.sourceColumn] || 0), 0);
        entry[m.dataKey] = groupRows.length ? sum / groupRows.length : 0;
      }
    }
    result.push(entry);
  }
  return result;
}

export async function generateChart(input: {
  sourceType: 'database' | 'file';
  tableName: string;
  columns: Array<{ name: string; type: string }>;
  sampleRows: any[];
  prompt: string;
  dbType?: string;
  preferredModel?: string;
  allRows?: any[];
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
    const rawRows = (input.allRows || input.sampleRows);
    if (config.aggregation?.groupBy && Array.isArray(config.aggregation.metrics)) {
      data = applyAggregation(rawRows, config.aggregation as Aggregation);
    } else {
      data = rawRows.slice(0, 500);
    }
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

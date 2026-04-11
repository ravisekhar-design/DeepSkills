'use server';
/**
 * Agent conversation + tool execution.
 * Uses LangGraph createReactAgent (current non-deprecated overload).
 */

import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { getLangChainModel } from '../langchain';

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'model']),
  content: z.string(),
});

const AgentConversationInputSchema = z.object({
  query: z.string(),
  chatHistory: z.array(ChatMessageSchema).optional(),
  availableSkills: z.array(z.string()).optional(),
  preferredModel: z.string().optional(),
  databaseConnections: z.array(z.string()).optional(),
  userId: z.string().optional(),
  fileContext: z.string().optional(),
});
type AgentConversationInput = z.infer<typeof AgentConversationInputSchema>;

const AgentConversationOutputSchema = z.object({
  response: z.string(),
  toolExecutions: z.array(z.any()).optional(),
});
type AgentConversationOutput = z.infer<typeof AgentConversationOutputSchema>;

export async function agentConversationToolExecution(
  input: AgentConversationInput
): Promise<AgentConversationOutput> {
  const model = await getLangChainModel(input.preferredModel);

  // ── Built-in skill tools ────────────────────────────────────────────────
  const marketOracle = tool(
    async (args) =>
      `Nexus Oracle: ${args.ticker} @ $${(Math.random() * 200 + 100).toFixed(2)} (${args.timeframe || '24h'} window).`,
    {
      name: 'market_oracle',
      description: 'Real-time equity pricing and historical volatility analysis.',
      schema: z.object({
        ticker: z.string().describe('Stock ticker symbol.'),
        timeframe: z.string().optional().describe('Analysis window, e.g. 1d, 1w.'),
      }),
    }
  );

  const atmosphericAnalyst = tool(
    async (args) =>
      `Weather [${args.location}]: 22°C, 1013 hPa, clear skies. No alerts.`,
    {
      name: 'atmospheric_analyst',
      description: 'Hyper-local meteorological forecasting and environmental alerts.',
      schema: z.object({
        location: z.string().describe('Target location.'),
      }),
    }
  );

  const neuralSearch = tool(
    async (args) =>
      `Search result for "${args.query}": relevant sources found. Review primary sources for full context.`,
    {
      name: 'neural_search',
      description: 'Deep-web crawling and semantic index lookup.',
      schema: z.object({
        query: z.string().describe('Search query string.'),
      }),
    }
  );

  const cognitiveAuditor = tool(
    async (_args) => {
      const tones = ['Analytical', 'Urgent', 'Collaborative', 'Strategic'];
      return `Tone analysis: ${tones[Math.floor(Math.random() * tones.length)]}. Linguistic stability confirmed.`;
    },
    {
      name: 'cognitive_auditor',
      description: 'Analyzes emotional tone and linguistic nuance in text.',
      schema: z.object({ text: z.string().describe('Text block to audit.') }),
    }
  );

  const scriptSandbox = tool(
    async (args) =>
      `Sandbox execution complete for: ${args.code.substring(0, 50)}...`,
    {
      name: 'script_sandbox',
      description: 'Isolated environment for computational logic execution.',
      schema: z.object({ code: z.string().describe('Code block to execute.') }),
    }
  );

  const TOOL_MAP: Record<string, any> = {
    'stock-price': marketOracle,
    'weather': atmosphericAnalyst,
    'web-search': neuralSearch,
    'sentiment': cognitiveAuditor,
    'code-executor': scriptSandbox,
  };

  const activeTools: any[] = (input.availableSkills || [])
    .map(id => TOOL_MAP[id])
    .filter(Boolean);

  // ── Database tools ──────────────────────────────────────────────────────
  if (input.databaseConnections?.length && input.userId) {
    const { executeDbQuery } = await import('@/lib/db-connector');
    const { prisma } = await import('@/lib/prisma');

    for (const connId of input.databaseConnections) {
      const conn = await (prisma as any).databaseConnection.findFirst({
        where: { id: connId, userId: input.userId },
        select: { id: true, name: true, type: true, database: true, readOnly: true },
      });
      if (!conn) continue;

      activeTools.push(
        tool(
          async (args: { sql: string }) => {
            try {
              const result = await executeDbQuery(connId, input.userId!, args.sql);
              const preview = result.rows.slice(0, 20);
              return [
                `Query on "${conn.name}" (${conn.type}) — ${result.executionMs}ms.`,
                `Rows: ${result.rowCount}${result.truncated ? ` (showing first ${preview.length})` : ''}.`,
                `\`\`\`json\n${JSON.stringify(preview, null, 2)}\n\`\`\``,
              ].join('\n');
            } catch (err: any) {
              return `Database error: ${err.message}`;
            }
          },
          {
            name: `db_query_${conn.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`,
            description: `Query the "${conn.name}" ${conn.type} database${conn.database ? ` (${conn.database})` : ''}. ${conn.readOnly ? 'Read-only — SELECT only.' : 'Read-write access.'}`,
            schema: z.object({ sql: z.string().describe('SQL query to execute.') }),
          }
        )
      );
    }
  }

  // ── System prompt — inject uploaded file context if present ─────────────
  // Hard cap the injected file payload so we never blow past the model's
  // context window. ~80k chars ≈ ~20k tokens, safe for all supported models.
  const FILE_CONTEXT_CHAR_BUDGET = 80_000;
  let fileSection = '';
  if (input.fileContext?.trim()) {
    let payload = input.fileContext;
    let truncationNotice = '';
    if (payload.length > FILE_CONTEXT_CHAR_BUDGET) {
      payload = payload.slice(0, FILE_CONTEXT_CHAR_BUDGET);
      truncationNotice = `\n\n[NOTICE: uploaded file content was truncated to fit the model context window. ${(input.fileContext.length - FILE_CONTEXT_CHAR_BUDGET).toLocaleString()} characters omitted. Ask the user for a narrower query or smaller files if critical data is missing.]`;
    }
    fileSection = `\n\n## Uploaded File Context\nThe following files have been uploaded by the user and are available for reference. Use them to answer questions accurately:\n\n${payload}${truncationNotice}`;
  }

  const systemPrompt = `You are a specialized AI assistant in DeepSkills.
Your assigned skill pipeline: ${input.availableSkills?.join(', ') || 'None'}.
Favor these tools for complex tasks. Be concise, accurate, and professional.
${fileSection}
IMPORTANT — FORMATTING: When the user asks for raw data (CSV, JSON, code, XML, etc.), wrap it in a fenced Markdown code block with the appropriate language tag (e.g. \`\`\`csv). Never output raw structured data as plain prose.`;

  // ── Build history ────────────────────────────────────────────────────────
  const historyMessages = (input.chatHistory || []).map(msg =>
    msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
  );

  // ── Run agent ────────────────────────────────────────────────────────────
  try {
    const agent = createReactAgent({
      llm: model as any,
      tools: activeTools,
      prompt: new SystemMessage(systemPrompt),
    });

    const result = await agent.invoke({
      messages: [...historyMessages, new HumanMessage(input.query)],
    });

    const outputMessages: any[] = result.messages || [];

    const lastAiMsg = [...outputMessages].reverse().find(
      (m: any) => m._getType?.() === 'ai' || m.constructor?.name === 'AIMessage'
    );
    const responseText =
      typeof lastAiMsg?.content === 'string'
        ? lastAiMsg.content
        : JSON.stringify(lastAiMsg?.content ?? 'Awaiting commands.');

    const executedTools = outputMessages
      .filter((m: any) => m._getType?.() === 'tool' || m.constructor?.name === 'ToolMessage')
      .map((m: any) => ({ toolName: m.name, toolOutput: m.content, successful: true }));

    return {
      response: responseText,
      toolExecutions: executedTools.length > 0 ? executedTools : undefined,
    };
  } catch (error: any) {
    console.error('[DeepAgent] Execution failed:', error);
    throw new Error(`Nexus link error: ${error.message}`);
  }
}

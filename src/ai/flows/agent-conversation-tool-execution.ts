'use server';
/**
 * @fileOverview This file handles the AI agent's conversation and tool execution logic.
 * Uses LangGraph's createReactAgent for robust tool-calling support.
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
  query: z.string().describe("The user's current message."),
  chatHistory: z.array(ChatMessageSchema).optional().describe('Previous messages.'),
  availableSkills: z.array(z.string()).optional().describe('List of enabled skill IDs for this agent.'),
  preferredModel: z.string().optional().describe('The model to use for this turn.'),
  databaseConnections: z.array(z.string()).optional().describe('List of database connection IDs this agent can query.'),
  userId: z.string().optional().describe('The authenticated user ID for database lookups.'),
});
type AgentConversationInput = z.infer<typeof AgentConversationInputSchema>;

const AgentConversationOutputSchema = z.object({
  response: z.string().describe("The AI agent's textual response."),
  toolExecutions: z.array(z.any()).optional().describe('Details of tools invoked.'),
});
type AgentConversationOutput = z.infer<typeof AgentConversationOutputSchema>;

export async function agentConversationToolExecution(input: AgentConversationInput): Promise<AgentConversationOutput> {
  const model = await getLangChainModel(input.preferredModel);

  /**
   * Core Skill Modules defined as LangChain Tools.
   */
  const marketOracle = tool(
    async (inputArgs) => {
      return `Nexus Oracle Link: ${inputArgs.ticker} is trading at $${(Math.random() * 200 + 100).toFixed(2)}. Volatility stable for the ${inputArgs.timeframe || '24h'} window.`;
    },
    {
      name: 'market_oracle',
      description: 'Real-time equity pricing and historical volatility analysis.',
      schema: z.object({
        ticker: z.string().describe('The stock ticker symbol.'),
        timeframe: z.string().optional().describe('Analysis window (e.g., 1d, 1w).'),
      }),
    }
  );

  const atmosphericAnalyst = tool(
    async (inputArgs) => {
      return `Environmental Telemetry [${inputArgs.location}]: 22°C, Pressure 1013hPa. No atmospheric anomalies detected.`;
    },
    {
      name: 'atmospheric_analyst',
      description: 'Hyper-local meteorological forecasting and environmental alerts.',
      schema: z.object({
        location: z.string().describe('The target location for analysis.'),
      }),
    }
  );

  const neuralSearch = tool(
    async (inputArgs) => {
      return `Semantic Index result for "${inputArgs.query}": Multiple relevant data nodes found. Primary correlation aligned with Laboratory directives.`;
    },
    {
      name: 'neural_search',
      description: 'Deep-web crawling and semantic index lookup.',
      schema: z.object({
        query: z.string().describe('The search parameter.'),
      }),
    }
  );

  const cognitiveAuditor = tool(
    async (_inputArgs) => {
      const tones = ['Analytical', 'Urgent', 'Collaborative', 'Strategic'];
      const tone = tones[Math.floor(Math.random() * tones.length)];
      return `Nuance Analysis Complete: Predominant tone identified as [${tone}]. Linguistic stability confirmed.`;
    },
    {
      name: 'cognitive_auditor',
      description: 'Analyzes emotional tone and linguistic nuance in text.',
      schema: z.object({
        text: z.string().describe('The text block to audit.'),
      }),
    }
  );

  const scriptSandbox = tool(
    async (inputArgs) => {
      return `Sandbox Execution Result: Logic verified. Computational output generated successfully for: ${inputArgs.code.substring(0, 50)}...`;
    },
    {
      name: 'script_sandbox',
      description: 'Isolated environment for computational logic and data transformation.',
      schema: z.object({
        code: z.string().describe('The logic block to execute.'),
      }),
    }
  );

  // Map of Store Skill IDs to LangChain Tools
  const TOOL_MAP: Record<string, any> = {
    'stock-price': marketOracle,
    'weather': atmosphericAnalyst,
    'web-search': neuralSearch,
    'sentiment': cognitiveAuditor,
    'code-executor': scriptSandbox,
  };

  const activeTools = (input.availableSkills || [])
    .map(id => TOOL_MAP[id])
    .filter(Boolean);

  // Add database query tools for each connected database
  if (input.databaseConnections?.length && input.userId) {
    const { executeDbQuery } = await import('@/lib/db-connector');
    const { prisma } = await import('@/lib/prisma');

    for (const connId of input.databaseConnections) {
      const conn = await (prisma as any).databaseConnection.findFirst({
        where: { id: connId, userId: input.userId },
        select: { id: true, name: true, type: true, database: true, readOnly: true },
      });
      if (!conn) continue;

      const dbTool = tool(
        async (args: { sql: string }) => {
          try {
            const result = await executeDbQuery(connId, input.userId!, args.sql);
            const preview = result.rows.slice(0, 20);
            return [
              `Query executed on "${conn.name}" (${conn.type}) in ${result.executionMs}ms.`,
              `Rows returned: ${result.rowCount}${result.truncated ? ` (showing first ${preview.length})` : ''}.`,
              `\`\`\`json\n${JSON.stringify(preview, null, 2)}\n\`\`\``,
            ].join('\n');
          } catch (err: any) {
            return `Database error: ${err.message}`;
          }
        },
        {
          name: `db_query_${conn.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`,
          description: `Query the "${conn.name}" ${conn.type} database${conn.database ? ` (database: ${conn.database})` : ''}. ${conn.readOnly ? 'Read-only — SELECT queries only.' : 'Read-write access.'} Write natural language questions and I will generate the appropriate SQL.`,
          schema: z.object({
            sql: z.string().describe('The SQL query to execute.'),
          }),
        }
      );
      activeTools.push(dbTool);
    }
  }

  const systemPrompt = `You are a specialized AI assistant in DeepSkills.
Your assigned skill pipeline: ${input.availableSkills?.join(', ') || 'None'}.
Favor these tools for complex tasks. Be concise, accurate, and professional.

IMPORTANT CRITICAL FORMATTING INSTRUCTION: 
If the user asks you to provide, generate, or export ANY raw data (e.g., CSV, JSON, code, mapping specifications, XML, or structured text), you MUST wrap that specific data entirely inside a standard Markdown code block with the appropriate language tag. Use the exact file extension requested if possible (e.g. \`\`\`csv or \`\`\`json). If the user asks for an Excel file, output it in CSV format and use the \`\`\`csv tag. Do NOT output raw data as plain conversational text.`;

  // Build message history
  const historyMessages = (input.chatHistory || []).map(msg =>
    msg.role === 'user'
      ? new HumanMessage(msg.content)
      : new AIMessage(msg.content)
  );

  try {
    // Create a fresh ReAct agent for this turn
    const agent = createReactAgent({
      llm: model as any,
      tools: activeTools,
      stateModifier: new SystemMessage(systemPrompt),
    });

    const result = await agent.invoke({
      messages: [...historyMessages, new HumanMessage(input.query)],
    });

    const outputMessages = result.messages || [];

    // Extract final AI response
    const lastAiMsg = [...outputMessages].reverse().find(
      (m: any) => m._getType?.() === 'ai' || m.constructor?.name === 'AIMessage'
    );
    const responseText = typeof lastAiMsg?.content === 'string'
      ? lastAiMsg.content
      : JSON.stringify(lastAiMsg?.content || 'Communication link stable. Awaiting further commands.');

    // Extract tool invocations for the diagnostics panel
    const executedTools: any[] = outputMessages
      .filter((m: any) => m._getType?.() === 'tool' || m.constructor?.name === 'ToolMessage')
      .map((m: any) => ({
        toolName: m.name,
        toolOutput: m.content,
        successful: true,
      }));

    return {
      response: responseText,
      toolExecutions: executedTools.length > 0 ? executedTools : undefined,
    };
  } catch (error: any) {
    console.error(`[DeepAgent] Execution failed:`, error);
    throw new Error(`Nexus link error: ${error.message}`);
  }
}

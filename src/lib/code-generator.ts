import { Skill, Agent } from './store';

// Built-in skill implementations that mirror agent-conversation-tool-execution.ts
const BUILTIN_SKILL_CODE: Record<string, string> = {
  'stock-price': `import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * Skill: Market Oracle
 * Category: Finance
 * Description: Real-time equity pricing and historical volatility analysis.
 *
 * SKILL.md
 * Match: When the user asks about stock prices, equity valuations, or market data.
 * Execute: Call this tool with the ticker symbol and optional timeframe.
 */
export const market_oracle = tool(
  async ({ ticker, timeframe }) => {
    // TODO: Replace with a real market data API (e.g., Alpha Vantage, Polygon.io)
    const price = (Math.random() * 200 + 100).toFixed(2);
    return \`Nexus Oracle Link: \${ticker} is trading at $\${price}. Volatility stable for the \${timeframe ?? '24h'} window.\`;
  },
  {
    name: 'market_oracle',
    description: 'Real-time equity pricing and historical volatility analysis.',
    schema: z.object({
      ticker: z.string().describe('The stock ticker symbol (e.g., AAPL, TSLA, MSFT).'),
      timeframe: z.string().optional().describe('Analysis window (e.g., 1d, 1w, 1m).'),
    }),
  }
);`,

  'weather': `import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * Skill: Atmospheric Analyst
 * Category: Utility
 * Description: Hyper-local meteorological forecasting and environmental alerts.
 *
 * SKILL.md
 * Match: When the user asks about weather, temperature, or atmospheric conditions.
 * Execute: Call this tool with the target location string.
 */
export const atmospheric_analyst = tool(
  async ({ location }) => {
    // TODO: Replace with a real weather API (e.g., OpenWeatherMap, WeatherAPI.com)
    return \`Environmental Telemetry [\${location}]: 22°C, Pressure 1013hPa. No atmospheric anomalies detected.\`;
  },
  {
    name: 'atmospheric_analyst',
    description: 'Hyper-local meteorological forecasting and environmental alerts.',
    schema: z.object({
      location: z.string().describe('The target location for weather analysis (city, coordinates, etc.).'),
    }),
  }
);`,

  'web-search': `import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * Skill: Neural Search
 * Category: Analysis
 * Description: Deep-web crawling and semantic index lookup.
 *
 * SKILL.md
 * Match: When the user needs up-to-date information, news, or facts from the web.
 * Execute: Call this tool with the search query string.
 */
export const neural_search = tool(
  async ({ query }) => {
    // TODO: Replace with a real search API (e.g., Serper, Brave Search, Tavily)
    return \`Semantic Index result for "\${query}": Multiple relevant data nodes found. Primary correlation aligned with Laboratory directives.\`;
  },
  {
    name: 'neural_search',
    description: 'Deep-web crawling and semantic index lookup.',
    schema: z.object({
      query: z.string().describe('The search query to look up.'),
    }),
  }
);`,

  'code-executor': `import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * Skill: Script Sandbox
 * Category: Logic
 * Description: Isolated environment for computational logic execution.
 *
 * SKILL.md
 * Match: When the user asks to execute, run, or evaluate a code snippet.
 * Execute: Call this tool with the code block to run in isolation.
 */
export const script_sandbox = tool(
  async ({ code }) => {
    // TODO: Replace with a real sandbox (e.g., E2B, Daytona, Deno sandbox)
    return \`Sandbox Execution Result: Logic verified. Computational output generated successfully for: \${code.substring(0, 50)}...\`;
  },
  {
    name: 'script_sandbox',
    description: 'Isolated environment for computational logic and data transformation.',
    schema: z.object({
      code: z.string().describe('The code block to execute in the sandbox.'),
    }),
  }
);`,
};

/**
 * Returns the implementation code for a skill.
 * For built-in skills, returns the actual tool implementation.
 * For custom skills, uses saved code or generates a template.
 */
export function generateSkillCode(skill: Skill): string {
  // Return saved custom code if present
  if (skill.code) return skill.code;

  // Return built-in implementation if available
  if (BUILTIN_SKILL_CODE[skill.id]) return BUILTIN_SKILL_CODE[skill.id];

  // Generate a template for unknown/custom skills
  const toolName = skill.id.replace(/[^a-zA-Z0-9]/g, '_');
  const inputParams = skill.inputs?.map(i => `      ${i}: z.string().describe('The ${i} parameter.'),`).join('\n') ?? '';
  const inputDestructure = skill.inputs?.join(', ') ?? '';

  return `import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * Skill: ${skill.name}
 * Category: ${skill.category}
 * Description: ${skill.description}
 *
 * SKILL.md
 * Match: Describe when the agent should use this skill.
 * Read: The agent reads this file when a match is detected.
 * Execute: The agent calls the tool with the parameters below.
 */
export const ${toolName} = tool(
  async ({ ${inputDestructure} }) => {
    // TODO: Implement the skill logic here.
    // This tool receives: ${skill.inputs?.join(', ') || 'no parameters'}
    // Return a string with the result for the agent to read.

    return \`[${skill.name}] executed successfully.\`;
  },
  {
    name: '${toolName}',
    description: '${skill.description}',
    schema: z.object({
${inputParams}
    }),
  }
);

// Register this tool in your agent pipeline:
// import { ${toolName} } from './skills/${skill.id}';
// const agent = createReactAgent({ llm: model, tools: [${toolName}], ... });
`;
}

/**
 * Returns the SKILL.md-style manifest for a skill.
 */
export function generateSkillManifest(skill: Skill): string {
  return `# ${skill.name}

## Description
${skill.description}

## Category
${skill.category}

## Parameters
${skill.inputs && skill.inputs.length > 0
    ? skill.inputs.map(i => `- \`${i}\`: string — description of this parameter`).join('\n')
    : '_No parameters required. This skill is triggered contextually._'
  }

## Activation Rules (Progressive Disclosure)

1. **Match** — The agent checks whether the user request aligns with this skill.
   - Trigger phrases: "${skill.name.toLowerCase()}", "${skill.description.split('.')[0].toLowerCase()}"

2. **Read** — If matched, the agent reads this manifest for full context.

3. **Execute** — The agent calls the tool with the required parameters and returns the result to the user.

## Notes
- Max description length: 1024 characters (truncated if exceeded)
- This SKILL.md file must stay under 10 MB
- Follows the Agent Skills specification (agentskills.io)
`;
}

/**
 * Generates the full TypeScript LangGraph agent code for a given agent config.
 */
export function generateAgentCode(agent: Agent, skills: Skill[]): string {
  const agentSkills = (agent.skills ?? []).map(id => skills.find(s => s.id === id)).filter(Boolean) as Skill[];
  const temp = agent.parameters?.temperature ?? 0.7;
  const maxTokens = agent.parameters?.maxLength ?? 1000;

  const toolImportLines = agentSkills.map(s =>
    `import { ${s.id.replace(/[^a-zA-Z0-9]/g, '_')} } from './skills/${s.id}';`
  ).join('\n');

  const toolListEntries = agentSkills.map(s =>
    `  ${s.id.replace(/[^a-zA-Z0-9]/g, '_')},  // ${s.name}`
  ).join('\n');

  const objectivesComment = (agent.objectives ?? []).map(o => `//   ${o}`).join('\n');

  return `/**
 * Deep Agent: ${agent.name}
 * ─────────────────────────────────────────────────────────────────────────────
 * Auto-generated by DeepSkills Agent Platform.
 * Runtime: LangGraph ReAct Agent (createReactAgent)
 * Framework: @langchain/langgraph + @langchain/core
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Skill Pipeline (${agentSkills.length} modules):
${agentSkills.map(s => ` *   [${s.category}] ${s.name} — ${s.description}`).join('\n') || ' *   (none configured)'}
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
// Swap for: ChatOpenAI, ChatAnthropic, ChatGroq, ChatMistralAI, etc.
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
${toolImportLines || '// No skill imports (no skills assigned)'}

// ─── Model ────────────────────────────────────────────────────────────────────
const llm = new ChatGoogleGenerativeAI({
  model: 'gemini-2.0-flash',
  temperature: ${temp},
  maxOutputTokens: ${maxTokens},
});

// ─── Skill Tools ──────────────────────────────────────────────────────────────
const tools = [
${toolListEntries || '  // Add skill tools here (see Skill Pipeline above)'}
];

// ─── Neural Persona (System Prompt) ───────────────────────────────────────────
const systemPrompt = \`${agent.persona.replace(/`/g, "'")}\`;

// ─── Strategic Objectives ─────────────────────────────────────────────────────
${objectivesComment || '// (no objectives defined)'}

// ─── Agent Assembly ───────────────────────────────────────────────────────────
export const agent = createReactAgent({
  llm,
  tools,
  stateModifier: new SystemMessage(systemPrompt),
});

// ─── Chat Function ────────────────────────────────────────────────────────────
type ChatMessage = { role: 'user' | 'model'; content: string };

export async function chat(
  userMessage: string,
  history: ChatMessage[] = []
): Promise<string> {
  const historyMessages = history.map(m =>
    m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
  );

  const result = await agent.invoke({
    messages: [...historyMessages, new HumanMessage(userMessage)],
  });

  const lastAI = [...result.messages].reverse().find(
    (m: any) => m._getType?.() === 'ai' || m.constructor?.name === 'AIMessage'
  );

  return typeof lastAI?.content === 'string'
    ? lastAI.content
    : JSON.stringify(lastAI?.content ?? 'No response.');
}

// ─── Example ──────────────────────────────────────────────────────────────────
// const response = await chat('Hello, what can you do?');
// console.log(response);
`;
}

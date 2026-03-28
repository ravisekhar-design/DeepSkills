import { Skill, Agent } from './store';

/**
 * Converts a skill display name to a valid snake_case JavaScript identifier.
 * Ensures the result never starts with a digit and is never empty.
 */
function toValidIdentifier(name: string): string {
  const snake = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return /^\d/.test(snake) ? `skill_${snake}` : snake || 'skill';
}

// Built-in skill implementations
const BUILTIN_SKILL_CODE: Record<string, string> = {
  'stock-price': `import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// Skill: Market Oracle
// Trigger: user asks about stock prices, equity, or market data.
export const market_oracle = tool(
  async ({ ticker, timeframe = '1d' }) => {
    // TODO: Replace with a real market data API (e.g. Alpha Vantage, Polygon.io)
    const price = (Math.random() * 200 + 100).toFixed(2);
    return \`\${ticker} is trading at $\${price} (\${timeframe} window). No anomalies detected.\`;
  },
  {
    name: 'market_oracle',
    description: 'Real-time equity pricing and historical volatility analysis.',
    schema: z.object({
      ticker: z.string().describe('Stock ticker symbol, e.g. AAPL, TSLA, MSFT.'),
      timeframe: z.string().optional().describe('Analysis window, e.g. 1d, 1w, 1m.'),
    }),
  }
);`,

  'weather': `import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// Skill: Atmospheric Analyst
// Trigger: user asks about weather, temperature, or atmospheric conditions.
export const atmospheric_analyst = tool(
  async ({ location }) => {
    // TODO: Replace with a real weather API (e.g. OpenWeatherMap, WeatherAPI.com)
    return \`[\${location}] 22°C, pressure 1013 hPa, clear skies. No alerts.\`;
  },
  {
    name: 'atmospheric_analyst',
    description: 'Hyper-local meteorological forecasting and environmental alerts.',
    schema: z.object({
      location: z.string().describe('Target location — city name, region, or coordinates.'),
    }),
  }
);`,

  'web-search': `import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// Skill: Neural Search
// Trigger: user needs up-to-date information, news, or facts from the web.
export const neural_search = tool(
  async ({ query }) => {
    // TODO: Replace with a real search API (e.g. Serper, Brave Search, Tavily)
    return \`Search result for "\${query}": relevant sources found. Review primary sources for full context.\`;
  },
  {
    name: 'neural_search',
    description: 'Deep-web crawling and semantic index lookup.',
    schema: z.object({
      query: z.string().describe('Search query string.'),
    }),
  }
);`,

  'code-executor': `import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// Skill: Script Sandbox
// Trigger: user asks to execute, run, or evaluate a code snippet.
export const script_sandbox = tool(
  async ({ code }) => {
    // TODO: Replace with a real sandbox (e.g. E2B, Daytona, Deno sandbox)
    return \`Sandbox execution complete for snippet: \${code.substring(0, 60)}...\`;
  },
  {
    name: 'script_sandbox',
    description: 'Isolated environment for computational logic execution.',
    schema: z.object({
      code: z.string().describe('The code block to execute in the sandbox.'),
    }),
  }
);`,
};

/**
 * Returns the TypeScript implementation for a skill.
 * Priority: saved custom code → built-in implementation → generated template.
 */
export function generateSkillCode(skill: Skill): string {
  if (skill.code) return skill.code;
  if (BUILTIN_SKILL_CODE[skill.id]) return BUILTIN_SKILL_CODE[skill.id];

  const toolName = toValidIdentifier(skill.name);
  const params = (skill.inputs ?? [])
    .map(i => `      ${i}: z.string().describe('${i} value.'),`)
    .join('\n');
  const args = (skill.inputs ?? []).join(', ');

  return `import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// Skill: ${skill.name}
// Category: ${skill.category}
// Trigger: describe when the agent should invoke this skill.
export const ${toolName} = tool(
  async ({ ${args} }) => {
    // TODO: implement skill logic for ${skill.name}
    // Inputs available: ${skill.inputs?.join(', ') || 'none'}
    return \`[${skill.name}] executed with: \${JSON.stringify({ ${args} })}\`;
  },
  {
    name: '${toolName}',
    description: '${skill.description}',
    schema: z.object({
${params}
    }),
  }
);
`;
}

/**
 * Returns the SKILL.md manifest for a skill.
 * Uses saved custom manifest if present, otherwise generates one.
 */
export function generateSkillManifest(skill: Skill): string {
  if ((skill as any).manifest) return (skill as any).manifest;

  const params = skill.inputs && skill.inputs.length > 0
    ? skill.inputs.map(i => `- \`${i}\` (string, required): describe this parameter`).join('\n')
    : '_No parameters required._';

  return `# ${skill.name}

## Description
${skill.description}

## Category
${skill.category}

## When to Use
Describe the exact conditions or user phrases that should trigger this skill.

## Parameters
${params}

## Returns
A string describing the result of the skill execution.

## Progressive Disclosure

### Match
The agent checks if the user's request aligns with: "${skill.name.toLowerCase()}" or "${skill.description.split('.')[0].toLowerCase()}".

### Read
If matched, the agent reads this manifest to understand the full skill interface.

### Execute
The agent calls the tool with the required parameters and returns the result.

## Notes
- Keep this file under 10 MB
- Max description length: 1024 characters
- Follows the Agent Skills specification (agentskills.io)
`;
}

/**
 * Generates the full TypeScript LangGraph ReAct agent code.
 * Returns agent.code if a custom implementation has been saved.
 */
export function generateAgentCode(agent: Agent, skills: Skill[]): string {
  if (agent.code) return agent.code;

  const agentSkills = (agent.skills ?? [])
    .map(id => skills.find(s => s.id === id))
    .filter(Boolean) as Skill[];

  const temp = agent.parameters?.temperature ?? 0.7;
  const maxTokens = agent.parameters?.maxLength ?? 2048;

  const imports = agentSkills.length > 0
    ? agentSkills.map(s => `import { ${toValidIdentifier(s.name)} } from './skills/${toValidIdentifier(s.name)}';`).join('\n')
    : '// No skills assigned — add skill imports here';

  const toolsList = agentSkills.length > 0
    ? agentSkills.map(s => `  ${toValidIdentifier(s.name)},`).join('\n')
    : '  // add tools here';

  const objectives = (agent.objectives ?? [])
    .map(o => `// - ${o}`)
    .join('\n');

  const skillPipeline = agentSkills.length > 0
    ? agentSkills.map(s => `//   [${s.category}] ${s.name}: ${s.description}`).join('\n')
    : '//   (no skills assigned)';

  return `/**
 * Agent: ${agent.name}
 * Generated by DeepSkills · LangGraph ReAct · @langchain/langgraph
 *
 * Skill pipeline (${agentSkills.length} tool${agentSkills.length === 1 ? '' : 's'}):
${skillPipeline}
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
// Swap model: ChatGoogleGenerativeAI, ChatAnthropic, ChatGroq, ChatMistralAI
import { HumanMessage, AIMessage } from '@langchain/core/messages';
${imports}

// Model configuration
const model = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: ${temp},
  maxTokens: ${maxTokens},
});

// Skill tools
const tools = [
${toolsList}
];

// Agent objectives:
${objectives || '// (none defined)'}

// System persona
const systemPrompt = \`${agent.persona.replace(/`/g, "'")}\`;

// Assemble the ReAct agent
export const agent = createReactAgent({
  llm: model,
  tools,
  stateModifier: systemPrompt,
});

// Chat helper
type Message = { role: 'user' | 'assistant'; content: string };

export async function chat(
  userMessage: string,
  history: Message[] = []
): Promise<string> {
  const messages = [
    ...history.map(m =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
    ),
    new HumanMessage(userMessage),
  ];

  const result = await agent.invoke({ messages });

  const lastAI = [...result.messages]
    .reverse()
    .find((m: any) => m._getType?.() === 'ai' || m.constructor?.name === 'AIMessage');

  return typeof lastAI?.content === 'string'
    ? lastAI.content
    : JSON.stringify(lastAI?.content ?? '');
}

// Usage example:
// const reply = await chat('Hello, what can you do?');
// console.log(reply);
`;
}

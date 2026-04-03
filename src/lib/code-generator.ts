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

/**
 * Returns the directory-safe folder name for a skill.
 * e.g. "Stock Price" → "stock_price"
 */
function toSkillDirName(name: string): string {
  return toValidIdentifier(name);
}

// Built-in skill implementations — official Deep Agents format
// tool() from 'langchain', schema via zod
const BUILTIN_SKILL_CODE: Record<string, string> = {
  'stock-price': `import * as z from 'zod';
import { tool } from 'langchain';

export const market_oracle = tool(
  async ({ ticker, timeframe = '1d' }) => {
    // TODO: Replace with a real market data API (e.g. Alpha Vantage, Polygon.io)
    const price = (Math.random() * 200 + 100).toFixed(2);
    return \`\${ticker} is trading at $\${price} (\${timeframe} window).\`;
  },
  {
    name: 'market_oracle',
    description: 'Retrieves real-time equity pricing and historical market data. Use when the user asks about stock prices, tickers, or market performance.',
    schema: z.object({
      ticker: z.string().describe('Stock ticker symbol, e.g. AAPL, TSLA, MSFT.'),
      timeframe: z.string().optional().describe('Analysis window, e.g. 1d, 1w, 1m.'),
    }),
  }
);`,

  'weather': `import * as z from 'zod';
import { tool } from 'langchain';

export const weather = tool(
  async ({ location }) => {
    // TODO: Replace with a real weather API (e.g. OpenWeatherMap, WeatherAPI.com)
    return \`[\${location}] 22°C, clear skies.\`;
  },
  {
    name: 'weather',
    description: 'Retrieves current weather conditions for a location. Use when the user asks about temperature, forecast, or atmospheric conditions.',
    schema: z.object({
      location: z.string().describe('City name, region, or coordinates.'),
    }),
  }
);`,

  'web-search': `import * as z from 'zod';
import { tool } from 'langchain';

export const web_search = tool(
  async ({ query }) => {
    // TODO: Replace with a real search API (e.g. Tavily, Serper, Brave Search)
    return \`Search results for "\${query}": relevant sources found.\`;
  },
  {
    name: 'web_search',
    description: 'Searches the web for up-to-date information. Use when the user needs current facts, news, or information beyond your training data.',
    schema: z.object({
      query: z.string().describe('The search query string.'),
    }),
  }
);`,

  'code-executor': `import * as z from 'zod';
import { tool } from 'langchain';

export const code_executor = tool(
  async ({ code, language = 'typescript' }) => {
    // TODO: Replace with a real sandbox (e.g. E2B, Daytona, Deno sandbox)
    return \`[\${language}] Execution complete for: \${code.substring(0, 60)}...\`;
  },
  {
    name: 'code_executor',
    description: 'Executes code in an isolated sandbox environment. Use when the user asks to run, test, or evaluate a code snippet.',
    schema: z.object({
      code: z.string().describe('The code to execute.'),
      language: z.string().optional().describe('Programming language, e.g. typescript, python.'),
    }),
  }
);`,
};

/**
 * Returns the TypeScript implementation for a skill.
 * Follows the official Deep Agents tool() pattern.
 * Priority: saved custom code → built-in implementation → generated template.
 */
export function generateSkillCode(skill: Skill): string {
  if (skill.code) return skill.code;
  if (BUILTIN_SKILL_CODE[skill.id]) return BUILTIN_SKILL_CODE[skill.id];

  const toolName = toValidIdentifier(skill.name);
  const inputs = skill.inputs ?? [];

  const schemaFields = inputs.length > 0
    ? inputs.map(i => `      ${i}: z.string().describe('The ${i} parameter.'),`).join('\n')
    : '      // No parameters required';

  const destructured = inputs.length > 0 ? `{ ${inputs.join(', ')} }` : '_args';

  const returnExpr = inputs.length > 0
    ? `\`[${skill.name}] called with: \${JSON.stringify({ ${inputs.join(', ')} })}\``
    : `'[${skill.name}] executed successfully.'`;

  return `import * as z from 'zod';
import { tool } from 'langchain';

export const ${toolName} = tool(
  async (${destructured}) => {
    // TODO: Implement the ${skill.name} skill logic here.
    // Refer to SKILL.md for full instructions and parameter details.
    return ${returnExpr};
  },
  {
    name: '${toolName}',
    description: '${skill.description}',
    schema: z.object({
${schemaFields}
    }),
  }
);
`;
}

/**
 * Returns the SKILL.md manifest for a skill.
 * Follows the official Deep Agents SKILL.md format with YAML frontmatter.
 * Uses saved custom manifest if present.
 */
export function generateSkillManifest(skill: Skill): string {
  if ((skill as any).manifest) return (skill as any).manifest;

  const toolName = toValidIdentifier(skill.name);
  const inputs = skill.inputs ?? [];

  const paramDocs = inputs.length > 0
    ? inputs.map(i => `- \`${i}\` (string, required): Describe what ${i} represents.`).join('\n')
    : '_This skill requires no input parameters._';

  const descSnippet = skill.description.length > 200
    ? skill.description.substring(0, 200) + '...'
    : skill.description;

  return `---
name: ${skill.name}
description: ${descSnippet}
metadata:
  category: ${skill.category}
  tool: ${toolName}
---

## Overview
${skill.description}

## When to Use
Invoke this skill when the user's request relates to **${skill.name.toLowerCase()}** or matches phrases like:
- "${skill.description.split('.')[0].toLowerCase()}"
- Any request involving ${skill.category.toLowerCase()} tasks

## Instructions
1. Review the user's message and confirm it matches this skill's purpose.
2. Extract the required parameters from the user's input.
3. Call the \`${toolName}\` tool with the resolved parameters.
4. Return the tool's response directly to the user.

## Parameters
${paramDocs}

## Returns
A string containing the result of the ${skill.name} operation.

## Notes
- This file must remain under 10 MB.
- The \`description\` frontmatter field must not exceed 1,024 characters.
- Supporting files (scripts, references) can be placed alongside this SKILL.md.
`;
}

/**
 * Generates the full TypeScript Deep Agent entry point.
 * Follows the official LangChain Deep Agents JS/TS structure:
 * - createDeepAgent() from 'deepagents'
 * - tool() from 'langchain'
 * - Skills imported from ./skills/<name>/index
 * - system prompt via the `system` property
 *
 * Returns agent.code if a custom implementation has been saved.
 */
export function generateAgentCode(agent: Agent, skills: Skill[]): string {
  if (agent.code) return agent.code;

  const agentSkills = (agent.skills ?? [])
    .map(id => skills.find(s => s.id === id))
    .filter(Boolean) as Skill[];

  // Imports: one per skill directory
  const skillImports = agentSkills.length > 0
    ? agentSkills
        .map(s => `import { ${toValidIdentifier(s.name)} } from './skills/${toSkillDirName(s.name)}/index';`)
        .join('\n')
    : '// No skills assigned — import skill tools here';

  // tools array entries
  const toolsList = agentSkills.length > 0
    ? agentSkills.map(s => `  ${toValidIdentifier(s.name)},`).join('\n')
    : '  // add imported tools here';

  // System prompt from agent persona + objectives
  const objectives = (agent.objectives ?? []).filter(Boolean);
  const objectivesBlock = objectives.length > 0
    ? '\n\nObjectives:\n' + objectives.map(o => `- ${o}`).join('\n')
    : '';

  const systemPrompt = (agent.persona + objectivesBlock).replace(/`/g, "'");

  // Skill directory listing comment
  const skillDirComment = agentSkills.length > 0
    ? agentSkills
        .map(s => ` *   skills/${toSkillDirName(s.name)}/  — ${s.description}`)
        .join('\n')
    : ' *   (no skills assigned)';

  return `/**
 * Agent: ${agent.name}
 * Generated by DeepSkills — LangChain Deep Agents (JS/TS)
 *
 * Skills:
${skillDirComment}
 */

import { createDeepAgent } from 'deepagents';
${skillImports}

// Assemble the Deep Agent with skills and system prompt
export const agent = createDeepAgent({
  tools: [
${toolsList}
  ],
  system: \`${systemPrompt}\`,
});

// Chat helper — invoke the agent with a user message
export async function chat(
  userMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<string> {
  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: userMessage },
  ];

  const result = await agent.invoke({ messages });

  const last = result.messages[result.messages.length - 1];
  return typeof last?.content === 'string'
    ? last.content
    : JSON.stringify(last?.content ?? '');
}

// Usage:
// const reply = await chat('Hello, what can you do?');
// console.log(reply);
`;
}

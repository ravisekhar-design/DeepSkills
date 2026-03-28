'use server';
/**
 * @fileOverview Generates a detailed AI agent persona using LangChain.
 * Migrated from Genkit → LangChain so all configured providers (OpenAI, Anthropic,
 * Groq, Mistral, Google) work correctly via getLangChainModel routing.
 */

import { z } from 'zod';
import { getLangChainModel } from '../langchain';

const AgentPersonaGenerationOutputSchema = z.object({
  persona: z.string().describe('Detailed personality, communication style, and background.'),
  objectives: z.array(z.string()).describe('List of 3-5 strategic objectives.'),
  operationalParameters: z
    .record(z.string(), z.string())
    .describe('Initial behavioral settings as key-value pairs.'),
});

type AgentPersonaGenerationOutput = z.infer<typeof AgentPersonaGenerationOutputSchema>;

export async function agentPersonaGeneration(input: {
  roleDescription: string;
  preferredModel?: string;
}): Promise<AgentPersonaGenerationOutput> {
  const model = await getLangChainModel(input.preferredModel);
  const structured = model.withStructuredOutput(AgentPersonaGenerationOutputSchema);

  const result = await structured.invoke([
    {
      role: 'system',
      content: `You are an expert AI agent designer for DeepSkills. You create comprehensive, professional agent personas with strategic objectives and behavioral parameters. Always respond with valid JSON matching the requested schema.`,
    },
    {
      role: 'user',
      content: `Role Description: "${input.roleDescription}"

Generate a structured agent persona with:
- persona: A detailed paragraph describing personality, communication style, expertise, and background (3-5 sentences)
- objectives: 3-5 strategic mission objectives as an array of strings
- operationalParameters: A flat object of behavioral settings (e.g. { "response_style": "analytical", "language": "technical" })`,
    },
  ]);

  return result;
}

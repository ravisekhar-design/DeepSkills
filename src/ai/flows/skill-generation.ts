'use server';
/**
 * @fileOverview Synthesises a technical skill module definition using LangChain.
 * Migrated from Genkit → LangChain so all configured providers (OpenAI, Anthropic,
 * Groq, Mistral, Google) work correctly via getLangChainModel routing.
 */

import { z } from 'zod';
import { getLangChainModel } from '../langchain';

const SkillGenerationOutputSchema = z.object({
  name: z.string().describe('A professional, high-tech name for the skill.'),
  description: z.string().describe('Clear, functional description.'),
  category: z
    .enum(['Finance', 'Utility', 'Analysis', 'Creative', 'Logic', 'Intelligence'])
    .describe('Functional domain.'),
  inputs: z.array(z.string()).describe('List of 2-4 technical parameter names.'),
});

type SkillGenerationOutput = z.infer<typeof SkillGenerationOutputSchema>;

export async function generateSkill(input: {
  seed: string;
  preferredModel?: string;
}): Promise<SkillGenerationOutput> {
  const model = await getLangChainModel(input.preferredModel);
  const structured = model.withStructuredOutput(SkillGenerationOutputSchema);

  const result = await structured.invoke([
    {
      role: 'system',
      content: `You are a technical architect in DeepSkills. Synthesize professional skill module definitions. Maintain a clear, technical tone. Always respond with valid JSON matching the requested schema.`,
    },
    {
      role: 'user',
      content: `Based on the seed idea: "${input.seed}"

Synthesize a professional skill module definition with:
- name: A professional, high-tech name
- description: A clear functional description (1-2 sentences)
- category: One of Finance, Utility, Analysis, Creative, Logic, Intelligence
- inputs: 2-4 technical parameter names (snake_case strings)`,
    },
  ]);

  return result;
}

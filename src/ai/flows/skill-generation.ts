'use server';
/**
 * @fileOverview This flow enables the AI to synthesize technical skill modules for agents.
 */

import { getGenkitInstance } from '../genkit';
import { z } from 'genkit';

const SkillGenerationInputSchema = z.object({
  seed: z.string().describe("A name or short description of the skill's purpose."),
  preferredModel: z.string().optional().describe('The preferred model for synthesis.'),
});
type SkillGenerationInput = z.infer<typeof SkillGenerationInputSchema>;

const SkillGenerationOutputSchema = z.object({
  name: z.string().describe("A professional, high-tech name for the skill."),
  description: z.string().describe("Clear, functional description."),
  category: z.enum(['Finance', 'Utility', 'Analysis', 'Creative', 'Logic', 'Intelligence']).describe("Functional domain."),
  inputs: z.array(z.string()).describe("List of 2-4 technical parameter names."),
});
type SkillGenerationOutput = z.infer<typeof SkillGenerationOutputSchema>;

export async function generateSkill(input: SkillGenerationInput): Promise<SkillGenerationOutput> {
  const ai = await getGenkitInstance();

  const skillGenerationPrompt = ai.definePrompt({
    name: 'skillGenerationPrompt',
    input: { schema: SkillGenerationInputSchema },
    output: { schema: SkillGenerationOutputSchema },
    prompt: `You are a technical architect in DeepSkills.

  Based on the seed idea: "{{{seed}}}"

  Synthesize a professional skill module definition. Maintain a clear, technical tone.`,
  });

  const modelsToTry = [
    input.preferredModel,
    'googleai/gemini-flash-latest',
    'googleai/gemini-2.5-flash',
    'googleai/gemini-2.0-flash'
  ].filter(Boolean) as string[];

  let lastError = null;

  for (const modelId of modelsToTry) {
    try {
      const { output } = await skillGenerationPrompt(input, {
        model: modelId as any
      });
      return output as any;
    } catch (error: any) {
      lastError = error;
      console.warn(`Skill Synthesis failed with ${modelId}. Retrying... Error: ${error.message}`);
    }
  }

  throw lastError || new Error('Skill Synthesis failed.');
}

'use server';
/**
 * @fileOverview This file defines a Genkit flow for generating detailed AI agent personas.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AgentPersonaGenerationInputSchema = z.object({
  roleDescription: z.string().describe("A high-level description of the AI agent's role and purpose."),
  preferredModel: z.string().optional().describe('The preferred model identifier for this generation.'),
});

type AgentPersonaGenerationInput = z.infer<typeof AgentPersonaGenerationInputSchema>;

const AgentPersonaGenerationOutputSchema = z.object({
  persona: z.string().describe('Detailed personality, communication style, and background.'),
  objectives: z.array(z.string()).describe('List of strategic objectives.'),
  operationalParameters: z.record(z.string(), z.string()).describe('Initial behavioral settings.'),
});

type AgentPersonaGenerationOutput = z.infer<typeof AgentPersonaGenerationOutputSchema>;

const agentPersonaPrompt = ai.definePrompt({
  name: 'agentPersonaPrompt',
  input: { schema: AgentPersonaGenerationInputSchema },
  output: { schema: AgentPersonaGenerationOutputSchema },
  prompt: `You are an expert AI agent designer for the Personal Laboratory. Develop a comprehensive persona and strategic parameters.

Role Description: {{{roleDescription}}}

Generate a structured JSON response matching the required schema.`,
});

export async function agentPersonaGeneration(input: AgentPersonaGenerationInput): Promise<AgentPersonaGenerationOutput> {
  const modelsToTry = [
    input.preferredModel,
    'googleai/gemini-flash-latest',
    'googleai/gemini-2.5-flash',
    'googleai/gemini-2.0-flash'
  ].filter(Boolean) as string[];

  let lastError = null;

  for (const modelId of modelsToTry) {
    try {
      const { output } = await agentPersonaPrompt(input, {
        model: modelId as any
      });
      return output!;
    } catch (error: any) {
      lastError = error;
      console.error(`====== PERSONA SYNTHESIS ERROR [${modelId}] ======`);
      console.error(error);
      console.error(error?.stack);
      console.warn(`Persona Synthesis failed with ${modelId}. Retrying... Error: ${error.message}`);
    }
  }

  throw lastError || new Error('Persona Synthesis failed.');
}

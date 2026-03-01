import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { openAI } from 'genkitx-openai';
import { anthropic } from 'genkitx-anthropic';

/**
 * Centrally initialized Genkit instance for the Personal Laboratory.
 * Plugins are initialized defensively based on environment variables.
 */

const plugins: any[] = [googleAI()];

// Add community plugins if keys exist
if (process.env.OPENAI_API_KEY) {
  plugins.push(openAI() as any);
}

if (process.env.ANTHROPIC_API_KEY) {
  plugins.push(anthropic() as any);
}

export const ai = genkit({
  plugins,
  // Default to a stable core model identifier
  model: 'googleai/gemini-flash-latest',
});

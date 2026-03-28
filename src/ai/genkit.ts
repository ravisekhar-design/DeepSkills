import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { openAI } from 'genkitx-openai';
import { anthropic } from 'genkitx-anthropic';
import { injectDynamicKeys } from '@/lib/keys-injector';

/**
 * Asynchronously initializes the Genkit instance for the Personal Laboratory.
 * Fetches dynamic keys securely from Prisma first.
 */
export async function getGenkitInstance() {
  await injectDynamicKeys();

  const plugins: any[] = [googleAI()];

  // Add community plugins if keys exist in runtime process.env
  if (process.env.OPENAI_API_KEY) {
    plugins.push(openAI() as any);
  }

  if (process.env.ANTHROPIC_API_KEY) {
    plugins.push(anthropic() as any);
  }

  return genkit({
    plugins,
    // Default to a stable core model identifier
    model: 'googleai/gemini-flash-latest',
  });
}

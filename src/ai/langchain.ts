import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { injectDynamicKeys } from '@/lib/keys-injector';

/**
 * Asynchronously initializes the appropriate LangChain model based on the user's preferred model ID.
 * Fetches dynamic keys securely from Prisma first.
 * Automatically falls back to Google GenAI if the requested provider has no valid API key.
 */
export async function getLangChainModel(modelId?: string) {
  await injectDynamicKeys();

  const id = modelId || 'googleai/gemini-2.0-flash';

  if (id.startsWith('openai/') || id.startsWith('gpt')) {
    if (process.env.OPENAI_API_KEY) {
      const model = id.replace('openai/', '');
      return new ChatOpenAI({
        modelName: model,
        openAIApiKey: process.env.OPENAI_API_KEY,
      });
    }
    console.warn(`[LangChain] OpenAI key not found for model "${id}", falling back to Google GenAI.`);
  }

  if (id.startsWith('anthropic/') || id.startsWith('claude')) {
    if (process.env.ANTHROPIC_API_KEY) {
      const model = id.replace('anthropic/', '');
      return new ChatAnthropic({
        modelName: model,
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
    console.warn(`[LangChain] Anthropic key not found for model "${id}", falling back to Google GenAI.`);
  }

  // Default / fallback: Google GenAI
  const googleModel = id.startsWith('googleai/') ? id.replace('googleai/', '') : 'gemini-2.0-flash';
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    throw new Error("Google GenAI API key is not configured. Please add it in Settings → API Keys.");
  }
  return new ChatGoogleGenerativeAI({
    model: googleModel,
    apiKey: process.env.GOOGLE_GENAI_API_KEY,
  });
}

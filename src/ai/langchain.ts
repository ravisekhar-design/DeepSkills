import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGroq } from "@langchain/groq";
import { ChatMistralAI } from "@langchain/mistralai";
import { injectDynamicKeys } from '@/lib/keys-injector';

/**
 * Maps decommissioned Groq model IDs to their current replacements. Groq
 * removes older Llama / Mixtral checkpoints periodically and the API then
 * returns 400 model_decommissioned. Users whose saved settings still point at
 * a removed model are silently upgraded here.
 */
const GROQ_MODEL_ALIASES: Record<string, string> = {
  'llama-3.1-70b-versatile': 'llama-3.3-70b-versatile',
  'mixtral-8x7b-32768':      'llama-3.3-70b-versatile',
};

function remapGroqModel(model: string): string {
  return GROQ_MODEL_ALIASES[model] ?? model;
}

/**
 * Returns the first available model ID based on injected user API keys.
 * Must be called after injectDynamicKeys() so process.env reflects user-supplied keys.
 */
function getDefaultModelId(): string {
  if (process.env.GOOGLE_GENAI_API_KEY) return 'googleai/gemini-2.0-flash';
  if (process.env.OPENAI_API_KEY) return 'openai/gpt-4o-mini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic/claude-haiku-4-5-20251001';
  if (process.env.GROQ_API_KEY) return 'groq/llama-3.3-70b-versatile';
  if (process.env.MISTRAL_API_KEY) return 'mistral/mistral-small-latest';
  throw new Error('No AI provider keys configured. Please add API keys in Settings → API Keys.');
}

/**
 * Initializes the appropriate LangChain model based on the user's preferred model ID.
 * Keys are loaded dynamically from user settings — no platform environment variables required.
 * Throws a descriptive error pointing to Settings if the requested provider key is missing.
 */
export async function getLangChainModel(modelId?: string) {
  await injectDynamicKeys();

  const id = modelId || getDefaultModelId();

  if (id.startsWith('openai/') || id.startsWith('gpt')) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OpenAI API key is not configured. Please add it in Settings → API Keys.');
    return new ChatOpenAI({ modelName: id.replace('openai/', ''), openAIApiKey: key });
  }

  if (id.startsWith('anthropic/') || id.startsWith('claude')) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('Anthropic API key is not configured. Please add it in Settings → API Keys.');
    return new ChatAnthropic({ modelName: id.replace('anthropic/', ''), anthropicApiKey: key });
  }

  if (id.startsWith('groq/') || id.startsWith('llama') || id.startsWith('mixtral')) {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error('Groq API key is not configured. Please add it in Settings → API Keys.');
    // Auto-redirect Groq model IDs that have been decommissioned upstream so
    // users with old settings rows (saved before the deprecation) keep working
    // instead of getting "model_decommissioned" 400 errors at runtime.
    const groqModel = remapGroqModel(id.replace('groq/', ''));
    return new ChatGroq({ model: groqModel, apiKey: key });
  }

  if (id.startsWith('mistral/') || (id.includes('mistral') && !id.startsWith('googleai/'))) {
    const key = process.env.MISTRAL_API_KEY;
    if (!key) throw new Error('Mistral API key is not configured. Please add it in Settings → API Keys.');
    return new ChatMistralAI({ model: id.replace('mistral/', ''), apiKey: key });
  }

  // Google GenAI (googleai/ prefix or bare gemini model name)
  const key = process.env.GOOGLE_GENAI_API_KEY;
  if (!key) throw new Error('Google GenAI API key is not configured. Please add it in Settings → API Keys.');
  const googleModel = id.startsWith('googleai/') ? id.replace('googleai/', '') : id;
  return new ChatGoogleGenerativeAI({ model: googleModel, apiKey: key });
}

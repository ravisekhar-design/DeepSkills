import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function getDynamicKeys() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return {};

    const userId = (session.user as any).id;
    const settings = await prisma.systemSettings.findUnique({
      where: { userId }
    });

    if (settings?.apiKeys) {
      return JSON.parse(settings.apiKeys);
    }
  } catch (error) {
    console.warn('Failed to load dynamic API keys from Prisma', error);
  }
  return {};
}

export async function injectDynamicKeys() {
  const apiKeys = await getDynamicKeys();
  // Only inject keys that are non-empty strings to prevent broken/expired keys
  // from overriding intentionally blanked .env.local values
  if (apiKeys.google && apiKeys.google.trim()) process.env.GOOGLE_GENAI_API_KEY = apiKeys.google;
  if (apiKeys.openai && apiKeys.openai.trim()) process.env.OPENAI_API_KEY = apiKeys.openai;
  if (apiKeys.anthropic && apiKeys.anthropic.trim()) process.env.ANTHROPIC_API_KEY = apiKeys.anthropic;
  if (apiKeys.aws_access_key_id && apiKeys.aws_access_key_id.trim()) process.env.AWS_ACCESS_KEY_ID = apiKeys.aws_access_key_id;
  if (apiKeys.aws_secret_access_key && apiKeys.aws_secret_access_key.trim()) process.env.AWS_SECRET_ACCESS_KEY = apiKeys.aws_secret_access_key;
}

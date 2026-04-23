/**
 * LAYER: Backend / Core Service
 * User system settings — model mapping, provider flags, API keys.
 */

import { prisma } from '@/lib/prisma';
import type { SystemSettings } from '@/types/domain';

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return JSON.parse(raw ?? '') as T;
  } catch {
    return fallback;
  }
}

export const settingsService = {
  async get(userId: string): Promise<SystemSettings | null> {
    const row = await prisma.systemSettings.findUnique({ where: { userId } });
    if (!row) return null;
    return {
      modelMapping: safeParse(row.modelMapping, {
        personaGeneration: '',
        skillSynthesis: '',
        conversation: '',
        visualize: '',
      }),
      providers: safeParse(row.providers, {
        google: false,
        openai: false,
        anthropic: false,
        aws: false,
        groq: false,
        mistral: false,
      }),
      globalKillSwitch: row.globalKillSwitch,
      apiKeys: row.apiKeys ? safeParse(row.apiKeys, {}) : {},
    };
  },

  async upsert(userId: string, settings: SystemSettings): Promise<void> {
    await prisma.systemSettings.upsert({
      where: { userId },
      update: {
        modelMapping: JSON.stringify(settings.modelMapping ?? {}),
        providers: JSON.stringify(settings.providers ?? {}),
        globalKillSwitch: settings.globalKillSwitch ?? false,
        apiKeys: settings.apiKeys ? JSON.stringify(settings.apiKeys) : null,
      },
      create: {
        userId,
        modelMapping: JSON.stringify(settings.modelMapping ?? {}),
        providers: JSON.stringify(settings.providers ?? {}),
        globalKillSwitch: settings.globalKillSwitch ?? false,
        apiKeys: settings.apiKeys ? JSON.stringify(settings.apiKeys) : null,
      },
    });
  },
};

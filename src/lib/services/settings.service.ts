/**
 * LAYER: Backend / Core Service
 * User system settings — model mapping, provider flags, API keys.
 * API keys are encrypted at rest with AES-256-GCM and never sent to the browser.
 */

import { prisma } from '@/lib/prisma';
import type { SystemSettings } from '@/types/domain';
import { encryptApiKey, CONFIGURED_SENTINEL } from '@/lib/crypto';

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

    // Replace real API key values with a sentinel — never expose keys to the browser.
    // The client only needs to know whether a key is set (truthy sentinel) or not ('').
    let maskedKeys: Record<string, string> | undefined;
    if (row.apiKeys) {
      const raw = safeParse<Record<string, string>>(row.apiKeys, {});
      maskedKeys = {};
      for (const [k, v] of Object.entries(raw)) {
        maskedKeys[k] = v ? CONFIGURED_SENTINEL : '';
      }
    }

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
      apiKeys: maskedKeys ?? {},
    };
  },

  async upsert(userId: string, settings: SystemSettings): Promise<void> {
    // Read existing encrypted keys so we can preserve them when the browser sends
    // the CONFIGURED_SENTINEL (meaning the user did not change that field).
    const existing = await prisma.systemSettings.findUnique({ where: { userId } });
    const existingKeys = existing?.apiKeys
      ? safeParse<Record<string, string>>(existing.apiKeys, {})
      : {} as Record<string, string>;

    let newApiKeys: Record<string, string> | null = null;
    if (settings.apiKeys) {
      newApiKeys = {};
      for (const [k, v] of Object.entries(settings.apiKeys as Record<string, string>)) {
        if (!v || v === CONFIGURED_SENTINEL) {
          // Empty or sentinel → preserve whatever is stored (already encrypted or empty)
          newApiKeys[k] = existingKeys[k] ?? '';
        } else {
          // New plain-text value from the user — encrypt before persisting
          newApiKeys[k] = encryptApiKey(v);
        }
      }
    }

    const data = {
      modelMapping:     JSON.stringify(settings.modelMapping    ?? {}),
      providers:        JSON.stringify(settings.providers       ?? {}),
      globalKillSwitch: settings.globalKillSwitch               ?? false,
      apiKeys:          newApiKeys ? JSON.stringify(newApiKeys) : null,
    };

    await prisma.systemSettings.upsert({
      where:  { userId },
      update: data,
      create: { userId, ...data },
    });
  },
};

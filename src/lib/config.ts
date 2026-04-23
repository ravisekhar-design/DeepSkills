/**
 * LAYER: Backend / Core
 * Single place for all environment-variable access.
 * Import this module instead of reading process.env directly anywhere else.
 */

function require(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

export const config = {
  // ── Database ──────────────────────────────────────────────────────────────
  databaseUrl: require('DATABASE_URL'),

  // ── Auth ─────────────────────────────────────────────────────────────────
  nextAuthUrl: optional('NEXTAUTH_URL', 'http://localhost:3000'),
  nextAuthSecret: require('NEXTAUTH_SECRET'),

  // ── SMTP (optional — falls back to password auth when absent) ─────────────
  smtp: {
    host: optional('SMTP_HOST'),
    port: parseInt(optional('SMTP_PORT', '587'), 10),
    user: optional('SMTP_USER'),
    pass: optional('SMTP_PASS'),
    from: optional('SMTP_FROM'),
    configured: Boolean(
      process.env.SMTP_HOST &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS,
    ),
  },

  // ── AI provider API keys (env-level fallbacks; user keys stored in DB) ────
  ai: {
    googleApiKey: optional('GOOGLE_GENAI_API_KEY'),
    openaiApiKey: optional('OPENAI_API_KEY'),
    anthropicApiKey: optional('ANTHROPIC_API_KEY'),
    awsAccessKeyId: optional('AWS_ACCESS_KEY_ID'),
    awsSecretAccessKey: optional('AWS_SECRET_ACCESS_KEY'),
    groqApiKey: optional('GROQ_API_KEY'),
    mistralApiKey: optional('MISTRAL_API_KEY'),
  },

  // ── Runtime ───────────────────────────────────────────────────────────────
  nodeEnv: optional('NODE_ENV', 'development'),
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',
} as const;

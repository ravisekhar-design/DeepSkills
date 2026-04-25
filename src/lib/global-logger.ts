import { prisma } from './prisma';

/**
 * Global override for console methods to capture server output in the database.
 * Development-only — too noisy for production (and the Prisma query log is disabled
 * there anyway, so there would be nothing useful to capture).
 */
export function initializeGlobalLogger() {
  if (typeof window !== 'undefined') return;           // client guard
  if (process.env.NODE_ENV === 'production') return;   // dev-only

  if ((global as any).__loggerInitialized) return;
  (global as any).__loggerInitialized = true;

  const originalLog   = console.log;
  const originalInfo  = console.info;
  const originalWarn  = console.warn;
  const originalError = console.error;

  // Cap concurrent DB writes to prevent runaway queuing under high log volume.
  let activeWrites = 0;
  const MAX_ACTIVE_WRITES = 20;

  const writeLog = (level: string, args: any[]): void => {
    if (activeWrites >= MAX_ACTIVE_WRITES) return;

    const message = args
      .map(arg => {
        if (arg instanceof Error) return arg.stack || arg.message;
        if (typeof arg === 'object') {
          try { return JSON.stringify(arg); } catch { return String(arg); }
        }
        return String(arg);
      })
      .join(' ');

    // Skip log entries that are themselves about the SystemLog table — avoids
    // a feedback loop where the act of logging spawns another log entry.
    // Covers both the Prisma model name and raw SQL (PostgreSQL + SQLite).
    if (
      message.includes('SystemLog') ||
      message.includes('"SystemLog"') ||
      message.includes('systemLog')
    ) return;

    activeWrites++;
    prisma.systemLog
      .create({
        data: {
          level,
          message: message.substring(0, 5000),
        },
      })
      .catch(err => {
        // Use the captured original so this doesn't re-enter the overridden console.error.
        originalError('[Logger] DB write failed:', err instanceof Error ? err.message : err);
      })
      .finally(() => { activeWrites--; });
  };

  console.log   = (...args) => { originalLog.apply(console, args);   writeLog('info',  args); };
  console.info  = (...args) => { originalInfo.apply(console, args);  writeLog('info',  args); };
  console.warn  = (...args) => { originalWarn.apply(console, args);  writeLog('warn',  args); };
  console.error = (...args) => { originalError.apply(console, args); writeLog('error', args); };

  console.log('[System Logger] Global terminal interception active.');
}

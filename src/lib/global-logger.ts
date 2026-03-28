import { prisma } from './prisma';

/**
 * Global override for console methods to capture everything in the Prisma database.
 * This runs only on the server.
 */
export function initializeGlobalLogger() {
    if (typeof window !== 'undefined') return; // Only run on server
    if (process.env.NODE_ENV === 'production') return; // Dev only — too noisy for production

    // Prevent double-initialization in dev mode
    if ((global as any).__loggerInitialized) return;
    (global as any).__loggerInitialized = true;

    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;

    const writeLog = async (level: string, args: any[]) => {
        try {
            const message = args.map(arg => {
                if (typeof arg === 'object') {
                    if (arg instanceof Error) {
                        return arg.stack || arg.message;
                    }
                    try {
                        return JSON.stringify(arg);
                    } catch {
                        return String(arg);
                    }
                }
                return String(arg);
            }).join(' ');

            // Avoid logging our own Prisma queries for the logs themselves, 
            // otherwise we'd get an infinite loop!
            if (message.includes('SystemLog') || message.includes('INSERT INTO "main"."SystemLog"')) {
                return;
            }

            // Write to database
            await prisma.systemLog.create({
                data: {
                    level,
                    message: message.substring(0, 5000), // Cap length to prevent DB bloat
                }
            });
        } catch (dbError) {
            // If DB logging fails, just use original stderr so we don't crash the app
            originalError('[Logger Failure]', dbError);
        }
    };

    console.log = function (...args) {
        originalLog.apply(console, args);
        writeLog('info', args);
    };

    console.info = function (...args) {
        originalInfo.apply(console, args);
        writeLog('info', args);
    };

    console.warn = function (...args) {
        originalWarn.apply(console, args);
        writeLog('warn', args);
    };

    console.error = function (...args) {
        originalError.apply(console, args);
        writeLog('error', args);
    };

    console.log('[System Logger] Global terminal interception active. All output is now recorded to database.');
}

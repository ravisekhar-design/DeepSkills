export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { initializeGlobalLogger } = await import('./lib/global-logger');
        initializeGlobalLogger();
    }
}

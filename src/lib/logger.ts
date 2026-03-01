export async function logSystemEvent(
    level: 'info' | 'warn' | 'error' | 'fatal',
    message: string,
    details?: any
) {
    try {
        await fetch('/api/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level, message, details }),
        });
    } catch (e) {
        console.error("Local logger failure:", e);
    }
}

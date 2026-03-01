import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(req: Request) {
    try {
        const { level, message, details } = await req.json();

        const timestamp = new Date().toISOString();
        let logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        if (details) {
            logMessage += ` | Details: ${typeof details === 'object' ? JSON.stringify(details) : details}`;
        }
        logMessage += '\n';

        const dataDir = path.join(process.cwd(), 'data');
        const logFilePath = path.join(dataDir, 'nexus_system.log');

        // Ensure data directory exists
        await fs.mkdir(dataDir, { recursive: true });

        // Append to log file
        await fs.appendFile(logFilePath, logMessage, 'utf-8');

        return NextResponse.json({ success: true, logged: true });
    } catch (error) {
        console.error('Failed to write log:', error);
        return NextResponse.json({ success: false, error: 'Logging backend failure' }, { status: 500 });
    }
}

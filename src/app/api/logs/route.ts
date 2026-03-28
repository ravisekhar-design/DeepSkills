import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
    try {
        const { level, message, details } = await req.json();

        await prisma.systemLog.create({
            data: {
                level: level || 'info',
                message: message || 'Unknown log message',
                details: details ? (typeof details === 'object' ? JSON.stringify(details) : details) : null,
            }
        });

        return NextResponse.json({ success: true, logged: true });
    } catch (error) {
        console.error('Failed to write log to database:', error);
        return NextResponse.json({ success: false, error: 'Database logging failure' }, { status: 500 });
    }
}

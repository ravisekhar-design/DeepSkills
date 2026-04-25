import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // Require an active session — prevents unauthenticated log injection and
  // stops the cascade where a 500 response itself triggers another log call.
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { level, message, details } = body as {
      level?: string;
      message?: string;
      details?: unknown;
    };

    await prisma.systemLog.create({
      data: {
        level: level || 'info',
        message: (message || 'Unknown log message').substring(0, 5000),
        details: details
          ? (typeof details === 'object'
              ? JSON.stringify(details).substring(0, 2000)
              : String(details).substring(0, 2000))
          : null,
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    // Never return 500 — a 500 here would trigger another client-side log call,
    // creating an error cascade. Silently acknowledge and move on.
    return NextResponse.json({ success: false });
  }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get('limit') || '100'), 500);
    const level = searchParams.get('level') || undefined;

    const logs = await prisma.systemLog.findMany({
      where: level ? { level } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ data: logs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

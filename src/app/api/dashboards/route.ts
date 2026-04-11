import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

// GET /api/dashboards — list all dashboards for current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as any).id;

    const dashboards = await (prisma as any).dashboard.findMany({
      where: { userId },
      include: { _count: { select: { widgets: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({
      data: dashboards.map((d: any) => ({
        id: d.id,
        name: d.name,
        widgetCount: d._count.widgets,
        createdAt: d.createdAt.getTime(),
        updatedAt: d.updatedAt.getTime(),
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/dashboards — create a new dashboard
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as any).id;

    const { name } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const dashboard = await (prisma as any).dashboard.create({
      data: { userId, name: name.trim() },
    });

    return NextResponse.json({
      data: { id: dashboard.id, name: dashboard.name, widgetCount: 0, createdAt: dashboard.createdAt.getTime(), updatedAt: dashboard.updatedAt.getTime() },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

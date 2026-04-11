import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

// GET /api/dashboards/[id] — fetch dashboard with all its widgets
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as any).id;

    const dashboard = await (prisma as any).dashboard.findFirst({
      where: { id, userId },
      include: { widgets: { orderBy: { createdAt: 'asc' } } },
    });

    if (!dashboard) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({
      data: {
        id: dashboard.id,
        name: dashboard.name,
        createdAt: dashboard.createdAt.getTime(),
        updatedAt: dashboard.updatedAt.getTime(),
        widgets: (dashboard.widgets as any[]).map((w: any) => ({
          id: w.id,
          dashboardId: w.dashboardId,
          title: w.title,
          chartType: w.chartType,
          chartConfig: (() => { try { return JSON.parse(w.chartConfig); } catch { return {}; } })(),
          dataSourceType: w.dataSourceType,
          dataSourceId: w.dataSourceId,
          dataSourceName: w.dataSourceName,
          dataQuery: w.dataQuery,
          prompt: w.prompt,
          gridW: w.gridW,
          createdAt: w.createdAt.getTime(),
        })),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/dashboards/[id] — rename dashboard
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as any).id;

    const { name } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const dashboard = await (prisma as any).dashboard.findFirst({ where: { id, userId } });
    if (!dashboard) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updated = await (prisma as any).dashboard.update({
      where: { id },
      data: { name: name.trim() },
    });

    return NextResponse.json({ data: { id: updated.id, name: updated.name } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/dashboards/[id] — delete dashboard + all widgets
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as any).id;

    const dashboard = await (prisma as any).dashboard.findFirst({ where: { id, userId } });
    if (!dashboard) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await (prisma as any).dashboard.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

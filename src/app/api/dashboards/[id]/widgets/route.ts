import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

// POST /api/dashboards/[id]/widgets — add a widget to a dashboard
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as any).id;

    const dashboard = await (prisma as any).dashboard.findFirst({ where: { id: params.id, userId } });
    if (!dashboard) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await request.json();
    const { title, chartType, chartConfig, dataSourceType, dataSourceId, dataSourceName, dataQuery, prompt, gridW } = body;

    if (!title || !chartType || !chartConfig || !dataSourceType || !dataSourceId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const widget = await (prisma as any).dashboardWidget.create({
      data: {
        dashboardId: params.id,
        title,
        chartType,
        chartConfig: typeof chartConfig === 'string' ? chartConfig : JSON.stringify(chartConfig),
        dataSourceType,
        dataSourceId,
        dataSourceName: dataSourceName || '',
        dataQuery: dataQuery || null,
        prompt: prompt || '',
        gridW: gridW || 1,
      },
    });

    // Touch the dashboard's updatedAt
    await (prisma as any).dashboard.update({ where: { id: params.id }, data: { updatedAt: new Date() } });

    return NextResponse.json({
      data: {
        id: widget.id,
        dashboardId: widget.dashboardId,
        title: widget.title,
        chartType: widget.chartType,
        chartConfig: (() => { try { return JSON.parse(widget.chartConfig); } catch { return {}; } })(),
        dataSourceType: widget.dataSourceType,
        dataSourceId: widget.dataSourceId,
        dataSourceName: widget.dataSourceName,
        dataQuery: widget.dataQuery,
        prompt: widget.prompt,
        gridW: widget.gridW,
        createdAt: widget.createdAt.getTime(),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/dashboards/[id]/widgets?widgetId=xxx — remove a widget
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as any).id;

    const dashboard = await (prisma as any).dashboard.findFirst({ where: { id: params.id, userId } });
    if (!dashboard) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const widgetId = searchParams.get('widgetId');
    if (!widgetId) return NextResponse.json({ error: 'widgetId required' }, { status: 400 });

    await (prisma as any).dashboardWidget.delete({ where: { id: widgetId } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

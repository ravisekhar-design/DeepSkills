import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

// GET: list connections (passwords masked)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as any).id;
    const conns = await (prisma as any).databaseConnection.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    const safe = conns.map((c: any) => ({
      id: c.id, name: c.name, type: c.type,
      host: c.host, port: c.port, database: c.database,
      username: c.username,
      hasPassword: !!c.password,
      hasConnectionString: !!c.connectionString,
      ssl: c.ssl, readOnly: c.readOnly,
      createdAt: c.createdAt,
    }));
    return NextResponse.json({ data: safe });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST: create connection
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as any).id;
    const body = await req.json();
    const conn = await (prisma as any).databaseConnection.create({
      data: {
        userId,
        name: body.name,
        type: body.type,
        host: body.host || null,
        port: body.port ? parseInt(body.port) : null,
        database: body.database || null,
        username: body.username || null,
        password: body.password || null,
        connectionString: body.connectionString || null,
        ssl: body.ssl || false,
        readOnly: body.readOnly !== false,
      },
    });
    return NextResponse.json({ id: conn.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT: update connection
export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as any).id;
    const body = await req.json();
    const { id, ...rest } = body;
    const existing = await (prisma as any).databaseConnection.findFirst({ where: { id, userId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const updateData: any = {
      name: rest.name, type: rest.type,
      host: rest.host || null, port: rest.port ? parseInt(rest.port) : null,
      database: rest.database || null, username: rest.username || null,
      ssl: rest.ssl || false, readOnly: rest.readOnly !== false,
    };
    // Only update password/connectionString if provided (not masked placeholder)
    if (rest.password && !rest.password.includes('•')) updateData.password = rest.password;
    if (rest.connectionString && !rest.connectionString.includes('•')) updateData.connectionString = rest.connectionString;
    await (prisma as any).databaseConnection.update({ where: { id }, data: updateData });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE: remove connection
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as any).id;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    await (prisma as any).databaseConnection.deleteMany({ where: { id, userId } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

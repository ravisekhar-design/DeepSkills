import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { testDbConnection } from '@/lib/db-connector';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as any).id;
    const { connectionId } = await req.json();
    if (!connectionId) return NextResponse.json({ error: 'Missing connectionId' }, { status: 400 });
    const message = await testDbConnection(connectionId, userId);
    return NextResponse.json({ success: true, message });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

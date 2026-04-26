/**
 * LAYER: Middleware / BFF
 * Generic key-value store route — the BFF boundary that proxies between the
 * frontend's simple key-based contract and the backend domain services.
 *
 * Response shape keeps `{ data }` at the root so existing hooks/lib/store.ts
 * functions continue to work without change.
 */

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { ok, apiError } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { agentService } from '@/lib/services/agent.service';
import { skillService } from '@/lib/services/skill.service';
import { settingsService } from '@/lib/services/settings.service';
import { databaseService } from '@/lib/services/database.service';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// ── GET /api/store?key=nexus_* ────────────────────────────────────────────────

export const GET = withAuth(async (req: NextRequest, session) => {
  const key = req.nextUrl.searchParams.get('key');
  if (!key) throw new ValidationError('Missing key');

  const userId = session.user.id;
  let data: unknown = [];

  switch (key) {
    case 'nexus_agents':
      data = await agentService.getAll(userId);
      break;

    case 'nexus_skills':
      data = await skillService.getAll(userId);
      break;

    case 'nexus_settings':
      data = await settingsService.get(userId);
      break;

    case 'nexus_databases':
      data = await databaseService.getAll(userId);
      break;

    case 'nexus_chats': {
      const chats = await prisma.chatThread.findMany({ where: { userId } });
      data = chats.map(c => ({
        id: c.id,
        agentId: c.agentId,
        userId: c.userId,
        messages: (() => { try { return JSON.parse(c.messages); } catch { return []; } })(),
        updatedAt: c.updatedAt.getTime(),
      }));
      break;
    }

    default:
      return apiError('UNKNOWN_KEY', `Unknown store key: ${key}`, 400);
  }

  // Return `{ data }` — preserved for backward compat with useCollection / useDoc / lib/store.ts
  return ok(data);
});

// ── POST /api/store — bulk write ──────────────────────────────────────────────

export const POST = withAuth(async (req: NextRequest, session) => {
  const body = await req.json();
  const { key, data } = body ?? {};

  if (!key || data === undefined) throw new ValidationError('Missing key or data');

  const userId = session.user.id;

  switch (key) {
    case 'nexus_agents':
      await agentService.upsertMany(userId, data);
      break;

    case 'nexus_skills':
      await skillService.upsertMany(userId, data);
      break;

    case 'nexus_settings':
      await settingsService.upsert(userId, data);
      break;

    case 'nexus_databases':
      await databaseService.upsertMany(userId, data);
      break;

    case 'nexus_chats':
      if (Array.isArray(data)) {
        await Promise.all(
          data.map((c: any) =>
            prisma.chatThread.upsert({
              where: { userId_agentId: { userId, agentId: c.agentId } },
              update: { messages: JSON.stringify(c.messages ?? []) },
              create: {
                id: c.id,
                userId,
                agentId: c.agentId,
                messages: JSON.stringify(c.messages ?? []),
              },
            }),
          ),
        );
      }
      break;

    default:
      return apiError('UNKNOWN_KEY', `Unknown store key: ${key}`, 400);
  }

  return ok({ success: true });
});

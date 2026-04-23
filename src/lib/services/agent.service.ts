/**
 * LAYER: Backend / Core Service
 * All agent business logic lives here. API routes call this; they do not
 * query Prisma directly.
 */

import { prisma } from '@/lib/prisma';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import type { Agent } from '@/types/domain';

// ── Serialization helpers ─────────────────────────────────────────────────────

function parseArr(raw: string | null | undefined): string[] {
  try {
    return JSON.parse(raw ?? '[]');
  } catch {
    return [];
  }
}

function parseObj(raw: string | null | undefined): Record<string, unknown> {
  try {
    return JSON.parse(raw ?? '{}');
  } catch {
    return {};
  }
}

function toRow(a: Agent) {
  return {
    name: a.name,
    persona: a.persona,
    objectives: JSON.stringify(a.objectives ?? []),
    parameters: JSON.stringify(a.parameters ?? {}),
    skills: JSON.stringify(a.skills ?? []),
    databases: JSON.stringify(a.databases ?? []),
    fileFolders: JSON.stringify(a.fileFolders ?? []),
    files: JSON.stringify(a.files ?? []),
    status: a.status ?? 'active',
  };
}

function fromRow(a: any): Agent {
  return {
    id: a.id,
    name: a.name,
    persona: a.persona,
    objectives: parseArr(a.objectives),
    parameters: parseObj(a.parameters),
    skills: parseArr(a.skills),
    databases: parseArr(a.databases),
    fileFolders: parseArr(a.fileFolders),
    files: parseArr(a.files),
    status: a.status,
    userId: a.userId,
    updatedAt: a.updatedAt?.getTime?.() ?? a.updatedAt,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export const agentService = {
  async getAll(userId: string): Promise<Agent[]> {
    const rows = await prisma.agent.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(fromRow);
  },

  async getById(userId: string, id: string): Promise<Agent> {
    const row = await prisma.agent.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundError('Agent', id);
    return fromRow(row);
  },

  /** Bulk upsert — replaces the entire agent list for the user. */
  async upsertMany(userId: string, agents: Agent[]): Promise<void> {
    if (!Array.isArray(agents)) throw new ValidationError('agents must be an array');
    await prisma.$transaction(
      agents.map(a =>
        prisma.agent.upsert({
          where: { id: a.id ?? '' },
          update: toRow(a),
          create: { id: a.id, userId, ...toRow(a) },
        }),
      ),
    );
    const ids = agents.map(a => a.id).filter(Boolean) as string[];
    if (ids.length > 0) {
      await prisma.agent.deleteMany({ where: { userId, id: { notIn: ids } } });
    }
  },
};

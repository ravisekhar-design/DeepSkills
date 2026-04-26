/**
 * LAYER: Backend / Core Service
 * All skill business logic.
 */

import { prisma } from '@/lib/prisma';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import type { Skill } from '@/types/domain';

function fromRow(s: any): Skill {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
    inputs: (() => { try { return JSON.parse(s.inputs); } catch { return []; } })(),
    enabled: s.enabled,
    isCustom: s.isCustom ?? false,
    userId: s.userId,
  };
}

function toRow(s: Skill) {
  return {
    name: s.name,
    description: s.description,
    category: s.category,
    inputs: JSON.stringify(s.inputs ?? []),
    enabled: s.enabled !== false,
    isCustom: s.isCustom ?? false,
  };
}

export const skillService = {
  async getAll(userId: string): Promise<Skill[]> {
    const rows = await prisma.skill.findMany({ where: { userId } });
    return rows.map(fromRow);
  },

  async getById(userId: string, id: string): Promise<Skill> {
    const row = await prisma.skill.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundError('Skill', id);
    return fromRow(row);
  },

  async upsertMany(userId: string, skills: Skill[]): Promise<void> {
    if (!Array.isArray(skills)) throw new ValidationError('skills must be an array');
    await Promise.all(
      skills.map(s =>
        prisma.skill.upsert({
          where: { id: s.id ?? '' },
          update: toRow(s),
          create: { id: s.id, userId, ...toRow(s) },
        }),
      ),
    );
    const ids = skills.map(s => s.id).filter(Boolean) as string[];
    if (ids.length > 0) {
      await prisma.skill.deleteMany({ where: { userId, id: { notIn: ids } } });
    }
  },
};

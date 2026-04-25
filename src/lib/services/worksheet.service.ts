/**
 * LAYER: Backend / Core Service
 * Worksheet (saved chart) business logic.
 */

import { prisma } from '@/lib/prisma';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { semanticService } from './semantic.service';
import type { Worksheet, WorksheetConfig } from '@/lib/worksheet/types';
import { defaultConfig, configToSemanticQuery } from '@/lib/worksheet/types';
import type { QueryResult } from '@/lib/semantic/types';

function worksheetFromRow(row: any): Worksheet {
  return {
    id: row.id,
    modelId: row.modelId ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    config: (() => { try { return JSON.parse(row.config); } catch { return defaultConfig(); } })(),
    cachedData: row.cachedData
      ? (() => { try { return JSON.parse(row.cachedData); } catch { return undefined; } })()
      : undefined,
    cachedAt: row.cachedAt?.getTime?.() ?? undefined,
    createdAt: row.createdAt?.getTime?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.getTime?.() ?? row.updatedAt,
  };
}

export const worksheetService = {
  async getAll(userId: string): Promise<Worksheet[]> {
    const rows = await (prisma as any).worksheet.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(worksheetFromRow);
  },

  async getById(userId: string, id: string): Promise<Worksheet> {
    const row = await (prisma as any).worksheet.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundError('Worksheet', id);
    return worksheetFromRow(row);
  },

  async create(userId: string, data: {
    name: string;
    description?: string;
    modelId?: string;
    config?: WorksheetConfig;
  }): Promise<Worksheet> {
    if (!data.name?.trim()) throw new ValidationError('name is required');
    const row = await (prisma as any).worksheet.create({
      data: {
        userId,
        modelId: data.modelId || null,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        config: JSON.stringify(data.config ?? defaultConfig()),
      },
    });
    return worksheetFromRow(row);
  },

  async update(userId: string, id: string, data: Partial<{
    name: string;
    description: string;
    modelId: string | null;
    config: WorksheetConfig;
  }>): Promise<Worksheet> {
    const existing = await (prisma as any).worksheet.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError('Worksheet', id);
    const updateData: any = {};
    if (data.name !== undefined) {
      if (!data.name.trim()) throw new ValidationError('name is required');
      updateData.name = data.name.trim();
    }
    if (data.description !== undefined) updateData.description = data.description?.trim() || null;
    if (data.modelId !== undefined) updateData.modelId = data.modelId || null;
    if (data.config !== undefined) updateData.config = JSON.stringify(data.config);
    const row = await (prisma as any).worksheet.update({ where: { id }, data: updateData });
    return worksheetFromRow(row);
  },

  async delete(userId: string, id: string): Promise<void> {
    const existing = await (prisma as any).worksheet.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError('Worksheet', id);
    await (prisma as any).worksheet.delete({ where: { id } });
  },

  // ── Execute the worksheet's query and cache the result ────────────────────

  async execute(userId: string, id: string): Promise<QueryResult> {
    const ws = await this.getById(userId, id);
    if (!ws.modelId) throw new ValidationError('Worksheet has no semantic model bound');
    const query = configToSemanticQuery(ws.config);
    const result = await semanticService.executeQuery(userId, ws.modelId, query);
    // Persist cache
    await (prisma as any).worksheet.update({
      where: { id },
      data: {
        cachedData: JSON.stringify({ columns: result.columns, rows: result.rows }),
        cachedAt: new Date(),
      },
    });
    return result;
  },
};

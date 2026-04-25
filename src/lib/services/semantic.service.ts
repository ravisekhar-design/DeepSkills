/**
 * LAYER: Backend / Core Service
 * Semantic model business logic.
 */

import { prisma } from '@/lib/prisma';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { executeSemanticQuery, detectSchema } from '@/lib/semantic/engine';
import { executeDbQuery, ANALYTICS_MAX_ROWS } from '@/lib/db-connector';
import { parseFileContent, fetchFileSample } from '@/lib/file-utils';
import type {
  SemanticModel, SemanticQuery, QueryResult,
  FieldDef, CalcField, Hierarchy, SemanticSourceType,
} from '@/lib/semantic/types';

function modelFromRow(row: any): SemanticModel {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    sourceType: row.sourceType as SemanticSourceType,
    sourceId: row.sourceId,
    sourceName: row.sourceName,
    sourceTable: row.sourceTable ?? undefined,
    sourceSql: row.sourceSql ?? undefined,
    fields: parseJsonArr<FieldDef>(row.fields),
    calculations: parseJsonArr<CalcField>(row.calculations),
    hierarchies: parseJsonArr<Hierarchy>(row.hierarchies),
    createdAt: row.createdAt?.getTime?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.getTime?.() ?? row.updatedAt,
  };
}

function parseJsonArr<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; }
  catch { return []; }
}

export const semanticService = {
  // ── CRUD ──────────────────────────────────────────────────────────────────

  async getAll(userId: string): Promise<SemanticModel[]> {
    const rows = await (prisma as any).semanticModel.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(modelFromRow);
  },

  async getById(userId: string, id: string): Promise<SemanticModel> {
    const row = await (prisma as any).semanticModel.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundError('SemanticModel', id);
    return modelFromRow(row);
  },

  async create(userId: string, data: {
    name: string;
    description?: string;
    sourceType: SemanticSourceType;
    sourceId: string;
    sourceName: string;
    sourceTable?: string;
    sourceSql?: string;
    fields?: FieldDef[];
    calculations?: CalcField[];
    hierarchies?: Hierarchy[];
  }): Promise<SemanticModel> {
    if (!data.name?.trim()) throw new ValidationError('name is required');
    if (!data.sourceType || !data.sourceId) throw new ValidationError('source is required');

    let fields = data.fields ?? [];
    if (!fields.length) {
      fields = await this.autoDetectFields(
        userId, data.sourceType, data.sourceId, data.sourceTable, data.sourceSql,
      );
    }

    const row = await (prisma as any).semanticModel.create({
      data: {
        userId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        sourceName: data.sourceName,
        sourceTable: data.sourceTable || null,
        sourceSql: data.sourceSql || null,
        fields: JSON.stringify(fields),
        calculations: JSON.stringify(data.calculations ?? []),
        hierarchies: JSON.stringify(data.hierarchies ?? []),
      },
    });
    return modelFromRow(row);
  },

  async update(userId: string, id: string, data: Partial<{
    name: string;
    description: string;
    fields: FieldDef[];
    calculations: CalcField[];
    hierarchies: Hierarchy[];
    sourceTable: string;
    sourceSql: string;
  }>): Promise<SemanticModel> {
    const existing = await (prisma as any).semanticModel.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError('SemanticModel', id);
    const updateData: any = {};
    if (data.name !== undefined) {
      if (!data.name.trim()) throw new ValidationError('name is required');
      updateData.name = data.name.trim();
    }
    if (data.description !== undefined) updateData.description = data.description?.trim() || null;
    if (data.fields !== undefined) updateData.fields = JSON.stringify(data.fields);
    if (data.calculations !== undefined) updateData.calculations = JSON.stringify(data.calculations);
    if (data.hierarchies !== undefined) updateData.hierarchies = JSON.stringify(data.hierarchies);
    if (data.sourceTable !== undefined) updateData.sourceTable = data.sourceTable || null;
    if (data.sourceSql !== undefined) updateData.sourceSql = data.sourceSql || null;
    const row = await (prisma as any).semanticModel.update({ where: { id }, data: updateData });
    return modelFromRow(row);
  },

  async delete(userId: string, id: string): Promise<void> {
    const existing = await (prisma as any).semanticModel.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError('SemanticModel', id);
    await (prisma as any).semanticModel.delete({ where: { id } });
  },

  // ── Field auto-detection from source ─────────────────────────────────────

  async autoDetectFields(
    userId: string,
    sourceType: SemanticSourceType,
    sourceId: string,
    sourceTable?: string,
    sourceSql?: string,
  ): Promise<FieldDef[]> {
    let sampleRows: Record<string, unknown>[] = [];

    if (sourceType === 'database') {
      const sql = sourceSql
        || (sourceTable ? `SELECT * FROM "${sourceTable}" LIMIT 100` : null);
      if (!sql) return [];
      try {
        const result = await executeDbQuery(sourceId, userId, sql, 100);
        sampleRows = (result.rows as Record<string, unknown>[]).slice(0, 100);
      } catch { return []; }
    } else if (sourceType === 'prepared_dataset') {
      const ds = await (prisma as any).preparedDataset.findFirst({ where: { id: sourceId, userId } });
      if (ds) {
        try { sampleRows = JSON.parse(ds.sampleRows).slice(0, 100); } catch {}
      }
    } else if (sourceType === 'file') {
      // Uses fetchFileSample which handles both inline and chunked storage.
      try {
        sampleRows = await fetchFileSample(sourceId, userId, 100);
      } catch { return []; }
    }

    return detectSchema(sampleRows);
  },

  // ── Query execution ───────────────────────────────────────────────────────

  async executeQuery(userId: string, modelId: string, query: SemanticQuery): Promise<QueryResult> {
    const model = await this.getById(userId, modelId);
    return executeSemanticQuery(model, query, userId);
  },
};

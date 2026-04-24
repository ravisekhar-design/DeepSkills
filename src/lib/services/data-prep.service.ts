import { prisma } from '@/lib/prisma';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { executeFlow } from '@/lib/data-prep/executor';
import type { DataPrepFlow, PreparedDataset, PrepStep, StepPreviewResult } from '@/lib/data-prep/types';

function flowFromRow(row: any): DataPrepFlow {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    steps: (() => { try { return JSON.parse(row.steps); } catch { return []; } })(),
    createdAt: row.createdAt?.getTime?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.getTime?.() ?? row.updatedAt,
  };
}

function datasetFromRow(row: any): PreparedDataset {
  return {
    id: row.id,
    flowId: row.flowId,
    name: row.name,
    description: row.description ?? undefined,
    schema: (() => { try { return JSON.parse(row.schema); } catch { return []; } })(),
    sampleRows: (() => { try { return JSON.parse(row.sampleRows); } catch { return []; } })(),
    rowCount: row.rowCount ?? 0,
    createdAt: row.createdAt?.getTime?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.getTime?.() ?? row.updatedAt,
  };
}

export const dataPrepService = {
  // ── Flows ──────────────────────────────────────────────────────────────────

  async getAllFlows(userId: string): Promise<DataPrepFlow[]> {
    const rows = await (prisma as any).dataPrepFlow.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(flowFromRow);
  },

  async getFlowById(userId: string, id: string): Promise<DataPrepFlow> {
    const row = await (prisma as any).dataPrepFlow.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundError('DataPrepFlow', id);
    return flowFromRow(row);
  },

  async createFlow(userId: string, name: string, description?: string): Promise<DataPrepFlow> {
    if (!name?.trim()) throw new ValidationError('name is required');
    const row = await (prisma as any).dataPrepFlow.create({
      data: {
        userId,
        name: name.trim(),
        description: description?.trim() || null,
        steps: JSON.stringify([]),
      },
    });
    return flowFromRow(row);
  },

  async updateFlow(
    userId: string,
    id: string,
    data: { name?: string; description?: string; steps?: PrepStep[] },
  ): Promise<DataPrepFlow> {
    const existing = await (prisma as any).dataPrepFlow.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError('DataPrepFlow', id);
    const updateData: any = {};
    if (data.name !== undefined) {
      if (!data.name.trim()) throw new ValidationError('name is required');
      updateData.name = data.name.trim();
    }
    if (data.description !== undefined) updateData.description = data.description?.trim() || null;
    if (data.steps !== undefined) updateData.steps = JSON.stringify(data.steps);
    const row = await (prisma as any).dataPrepFlow.update({ where: { id }, data: updateData });
    return flowFromRow(row);
  },

  async deleteFlow(userId: string, id: string): Promise<void> {
    const existing = await (prisma as any).dataPrepFlow.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError('DataPrepFlow', id);
    await (prisma as any).dataPrepFlow.delete({ where: { id } });
  },

  // ── Preview (execute up to a step index) ──────────────────────────────────

  async previewFlow(userId: string, id: string, upToIndex?: number): Promise<StepPreviewResult> {
    const flow = await this.getFlowById(userId, id);
    return executeFlow(flow.steps, userId, upToIndex);
  },

  // ── Run (materialize output dataset) ──────────────────────────────────────

  async runFlow(userId: string, id: string): Promise<PreparedDataset> {
    const flow = await this.getFlowById(userId, id);
    const outputStep = flow.steps.find(s => s.config.type === 'output');
    if (!outputStep || outputStep.config.type !== 'output') {
      throw new ValidationError('Flow must have an Output step before running');
    }

    const result = await executeFlow(flow.steps, userId);
    if (result.error) throw new ValidationError(result.error);

    const outputConfig = outputStep.config;
    const existing = await (prisma as any).preparedDataset.findFirst({
      where: { flowId: id, userId },
    });

    const data = {
      userId,
      flowId: id,
      name: outputConfig.name,
      description: outputConfig.description?.trim() || null,
      schema: JSON.stringify(result.schema),
      sampleRows: JSON.stringify(result.rows.slice(0, 200)),
      rowCount: result.rowCount,
    };

    const row = existing
      ? await (prisma as any).preparedDataset.update({ where: { id: existing.id }, data })
      : await (prisma as any).preparedDataset.create({ data });

    return datasetFromRow(row);
  },

  // ── Datasets ──────────────────────────────────────────────────────────────

  async getAllDatasets(userId: string): Promise<PreparedDataset[]> {
    const rows = await (prisma as any).preparedDataset.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(datasetFromRow);
  },

  async getDatasetById(userId: string, id: string): Promise<PreparedDataset> {
    const row = await (prisma as any).preparedDataset.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundError('PreparedDataset', id);
    return datasetFromRow(row);
  },
};

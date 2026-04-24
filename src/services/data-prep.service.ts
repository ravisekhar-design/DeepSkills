'use client';

import { get, post, patch, del } from './api-client';
import type { DataPrepFlow, PreparedDataset, PrepStep, StepPreviewResult } from '@/lib/data-prep/types';

export const dataPrepClientService = {
  // ── Flows ──────────────────────────────────────────────────────────────────

  async getAllFlows(): Promise<DataPrepFlow[]> {
    return get<DataPrepFlow[]>('/api/data-prep');
  },

  async getFlowById(id: string): Promise<DataPrepFlow> {
    return get<DataPrepFlow>(`/api/data-prep/${id}`);
  },

  async createFlow(name: string, description?: string): Promise<DataPrepFlow> {
    return post<DataPrepFlow>('/api/data-prep', { name, description });
  },

  async updateFlow(
    id: string,
    data: { name?: string; description?: string; steps?: PrepStep[] },
  ): Promise<DataPrepFlow> {
    return patch<DataPrepFlow>(`/api/data-prep/${id}`, data);
  },

  async deleteFlow(id: string): Promise<void> {
    await del(`/api/data-prep/${id}`);
  },

  // ── Preview / Run ─────────────────────────────────────────────────────────

  async previewFlow(id: string, upToIndex?: number): Promise<StepPreviewResult> {
    return post<StepPreviewResult>(`/api/data-prep/${id}/preview`, { upToIndex });
  },

  async runFlow(id: string): Promise<PreparedDataset> {
    return post<PreparedDataset>(`/api/data-prep/${id}/run`, {});
  },

  // ── Datasets ──────────────────────────────────────────────────────────────

  async getAllDatasets(): Promise<PreparedDataset[]> {
    return get<PreparedDataset[]>('/api/data-prep/datasets');
  },
};

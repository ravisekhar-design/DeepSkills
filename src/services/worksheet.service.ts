'use client';

import { get, post, patch, del } from './api-client';
import type { Worksheet, WorksheetConfig } from '@/lib/worksheet/types';
import type { QueryResult } from '@/lib/semantic/types';

export const worksheetClientService = {
  async getAll(): Promise<Worksheet[]> {
    return get<Worksheet[]>('/api/worksheets');
  },

  async getById(id: string): Promise<Worksheet> {
    return get<Worksheet>(`/api/worksheets/${id}`);
  },

  async create(data: {
    name: string;
    description?: string;
    modelId?: string;
    config?: WorksheetConfig;
  }): Promise<Worksheet> {
    return post<Worksheet>('/api/worksheets', data);
  },

  async update(id: string, data: Partial<{
    name: string;
    description: string;
    modelId: string | null;
    config: WorksheetConfig;
  }>): Promise<Worksheet> {
    return patch<Worksheet>(`/api/worksheets/${id}`, data);
  },

  async delete(id: string): Promise<void> {
    await del(`/api/worksheets/${id}`);
  },

  async execute(id: string): Promise<QueryResult> {
    return post<QueryResult>(`/api/worksheets/${id}/execute`, {});
  },
};

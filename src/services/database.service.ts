'use client';

/**
 * LAYER: Frontend — Client Service
 * External database connection API calls.
 * Uses the dedicated /api/databases endpoints for proper REST semantics.
 */

import { get, post, put, del } from './api-client';
import type { DatabaseConnection } from '@/types/domain';

export const databaseClientService = {
  async getAll(): Promise<DatabaseConnection[]> {
    return get<DatabaseConnection[]>('/api/databases');
  },

  async create(data: Omit<DatabaseConnection, 'id' | 'userId' | 'createdAt'>): Promise<{ id: string }> {
    return post<{ id: string }>('/api/databases', data);
  },

  async update(data: DatabaseConnection): Promise<void> {
    await put('/api/databases', data);
  },

  async delete(id: string): Promise<void> {
    await del(`/api/databases?id=${id}`);
  },

  async test(conn: Partial<DatabaseConnection>): Promise<{ success: boolean; message?: string }> {
    return post('/api/db-test', conn);
  },
};

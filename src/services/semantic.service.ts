'use client';

import { get, post, patch, del } from './api-client';
import type {
  SemanticModel, SemanticQuery, QueryResult, FieldDef,
  CalcField, Hierarchy, SemanticSourceType,
} from '@/lib/semantic/types';

export const semanticClientService = {
  async getAll(): Promise<SemanticModel[]> {
    return get<SemanticModel[]>('/api/semantic-models');
  },

  async getById(id: string): Promise<SemanticModel> {
    return get<SemanticModel>(`/api/semantic-models/${id}`);
  },

  async create(data: {
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
    return post<SemanticModel>('/api/semantic-models', data);
  },

  async update(id: string, data: Partial<{
    name: string;
    description: string;
    fields: FieldDef[];
    calculations: CalcField[];
    hierarchies: Hierarchy[];
    sourceTable: string;
    sourceSql: string;
  }>): Promise<SemanticModel> {
    return patch<SemanticModel>(`/api/semantic-models/${id}`, data);
  },

  async delete(id: string): Promise<void> {
    await del(`/api/semantic-models/${id}`);
  },

  async query(id: string, query: SemanticQuery): Promise<QueryResult> {
    return post<QueryResult>(`/api/semantic-models/${id}/query`, query);
  },

  async autoDetect(data: {
    sourceType: SemanticSourceType;
    sourceId: string;
    sourceTable?: string;
    sourceSql?: string;
  }): Promise<FieldDef[]> {
    return post<FieldDef[]>('/api/semantic-models/auto-detect', data);
  },
};

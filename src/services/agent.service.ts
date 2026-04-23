'use client';

/**
 * LAYER: Frontend — Client Service
 * All agent API calls. Components and React Query hooks use this;
 * they never call fetch() directly.
 */

import { get, post } from './api-client';
import type { Agent } from '@/types/domain';

const STORE_KEY = 'nexus_agents';

export const agentClientService = {
  async getAll(): Promise<Agent[]> {
    return get<Agent[]>(`/api/store?key=${STORE_KEY}`);
  },

  async save(agent: Agent): Promise<void> {
    const agents = await this.getAll();
    const idx = agents.findIndex(a => a.id === agent.id);
    const updated = { ...agent, updatedAt: Date.now() };
    if (idx >= 0) agents[idx] = { ...agents[idx], ...updated };
    else agents.push(updated);
    await post('/api/store', { key: STORE_KEY, data: agents });
    window.dispatchEvent(new Event('nexus-local-update'));
  },

  async delete(id: string): Promise<void> {
    const agents = await this.getAll();
    const filtered = agents.filter(a => a.id !== id);
    await post('/api/store', { key: STORE_KEY, data: filtered });
    window.dispatchEvent(new Event('nexus-local-update'));
  },
};

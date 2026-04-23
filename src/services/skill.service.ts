'use client';

/**
 * LAYER: Frontend — Client Service
 * All skill API calls.
 */

import { get, post } from './api-client';
import type { Skill } from '@/types/domain';

const STORE_KEY = 'nexus_skills';

export const skillClientService = {
  async getAll(): Promise<Skill[]> {
    return get<Skill[]>(`/api/store?key=${STORE_KEY}`);
  },

  async save(skill: Skill): Promise<void> {
    const skills = await this.getAll();
    const idx = skills.findIndex(s => s.id === skill.id);
    if (idx >= 0) skills[idx] = { ...skills[idx], ...skill };
    else skills.push(skill);
    await post('/api/store', { key: STORE_KEY, data: skills });
    window.dispatchEvent(new Event('nexus-local-update'));
  },

  async delete(id: string): Promise<void> {
    const skills = await this.getAll();
    const filtered = skills.filter(s => s.id !== id);
    await post('/api/store', { key: STORE_KEY, data: filtered });
    window.dispatchEvent(new Event('nexus-local-update'));
  },
};

'use client';

/**
 * LAYER: Frontend — Client Service
 * System settings API calls.
 */

import { get, post } from './api-client';
import type { SystemSettings } from '@/types/domain';

const STORE_KEY = 'nexus_settings';

export const settingsClientService = {
  async get(): Promise<SystemSettings | null> {
    return get<SystemSettings | null>(`/api/store?key=${STORE_KEY}`);
  },

  async save(settings: SystemSettings): Promise<void> {
    await post('/api/store', { key: STORE_KEY, data: settings });
    window.dispatchEvent(new Event('nexus-local-update'));
  },
};

'use client';

import { useEffect, useState } from 'react';

// Mock DocumentData to avoid breaking downstream typing
export type DocumentData = any;
// Mock Query to avoid breaking downstream parameters
export type Query<T> = any;

export function useCollection<T = DocumentData>(query: Query<T> | null, mockKey: 'agents' | 'skills' | 'databases' = 'agents') {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(false);
      try {
        const res = await fetch(`/api/store?key=nexus_${mockKey}`, { cache: 'no-store' });
        const json = await res.json();
        const rawData = json.data || [];

        if (mockKey === 'agents' && Array.isArray(rawData)) {
          rawData.sort((a: any, b: any) => new Date(b.updatedAt || Date.now()).getTime() - new Date(a.updatedAt || Date.now()).getTime());
        }
        setData(Array.isArray(rawData) ? rawData : []);
      } catch (e: any) {
        setError(e);
        setData([]);
      }
    };

    loadData();
    window.addEventListener('nexus-local-update', loadData);
    return () => window.removeEventListener('nexus-local-update', loadData);
  }, [query, mockKey]);

  return { data, loading, error };
}

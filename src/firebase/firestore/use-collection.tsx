'use client';

import { useEffect, useState } from 'react';

// Mock DocumentData to avoid breaking downstream typing
export type DocumentData = any;
// Mock Query to avoid breaking downstream parameters
export type Query<T> = any;

export function useCollection<T = DocumentData>(query: Query<T> | null, mockKey: 'agents' | 'skills' = 'agents') {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(false);
      try {
        const res = await fetch(`/api/${mockKey}`, { cache: 'no-store' });
        const rawData = await res.json();

        if (mockKey === 'agents' && Array.isArray(rawData)) {
          rawData.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
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

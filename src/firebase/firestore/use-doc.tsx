'use client';

import { useEffect, useState } from 'react';

// Mock DocumentData to avoid breaking downstream typing
export type DocumentData = any;
// Mock DocumentReference to avoid breaking downstream parameters
export type DocumentReference<T> = any;

export function useDoc<T = DocumentData>(docRef: DocumentReference<T> | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(false);
      try {
        const res = await fetch(`/api/store?key=nexus_settings`, { cache: 'no-store' });
        const { data: rawData } = await res.json();
        setData(Object.keys(rawData || {}).length > 0 ? rawData : null);
      } catch (e: any) {
        setError(e);
        setData(null);
      }
    };

    loadData();

    window.addEventListener('nexus-local-update', loadData);
    return () => window.removeEventListener('nexus-local-update', loadData);
  }, [docRef]);

  return { data, loading, error };
}

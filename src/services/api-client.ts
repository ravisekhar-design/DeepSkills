'use client';

/**
 * LAYER: Frontend / BFF boundary
 * Base fetch wrapper used by every client service.
 * - Attaches Content-Type header
 * - Parses the standard ApiResponse envelope
 * - Throws typed errors on !success responses
 * - Normalises network / JSON errors into the same shape
 */

import type { ApiResponse } from '@/types/api';

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  let json: ApiResponse<T> | null = null;
  try {
    json = await res.json();
  } catch {
    throw new ApiClientError('PARSE_ERROR', 'Invalid JSON from server', res.status);
  }

  // New standard envelope
  if (typeof json?.success === 'boolean') {
    if (json.success && json.data !== undefined) return json.data;
    if (!json.success && json.error) {
      throw new ApiClientError(
        json.error.code,
        json.error.message,
        res.status,
        json.error.details,
      );
    }
  }

  // Legacy envelope: { data: ... } or { error: '...' }
  const legacy = json as any;
  if (legacy?.error) {
    throw new ApiClientError(
      'API_ERROR',
      typeof legacy.error === 'string' ? legacy.error : 'Request failed',
      res.status,
    );
  }
  if (legacy?.data !== undefined) return legacy.data as T;

  // Bare response (success: true without data)
  return undefined as unknown as T;
}

export async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  return parseResponse<T>(res);
}

export async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(res);
}

export async function put<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(res);
}

export async function patch<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(res);
}

export async function del<T = void>(url: string): Promise<T> {
  const res = await fetch(url, { method: 'DELETE' });
  return parseResponse<T>(res);
}

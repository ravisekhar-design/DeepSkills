/**
 * LAYER: Middleware / BFF
 * Standard response factories. Every route handler must use these instead
 * of constructing NextResponse objects manually.
 */

import { NextResponse } from 'next/server';
import type { ApiResponse, PaginationMeta } from '@/types/api';

const ts = () => new Date().toISOString();

export function ok<T>(data: T): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data, meta: { timestamp: ts() } });
}

export function created<T>(data: T): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    { success: true, data, meta: { timestamp: ts() } },
    { status: 201 },
  );
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function paginated<T>(
  data: T[],
  pagination: PaginationMeta,
): NextResponse<ApiResponse<T[]>> {
  return NextResponse.json({
    success: true,
    data,
    meta: { timestamp: ts(), pagination },
  });
}

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message, details } },
    { status },
  );
}

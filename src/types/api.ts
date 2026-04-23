/**
 * LAYER: Shared Contract
 * Standard API response envelope used by every route and every client service.
 * All routes must return ApiResponse<T>; all client code must expect it.
 */

/** Universal success/error envelope */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiErrorBody;
  meta?: ResponseMeta;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ResponseMeta {
  timestamp: string;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Convenience: pull typed data or throw */
export function unwrap<T>(res: ApiResponse<T>): T {
  if (!res.success || res.data === undefined) {
    const msg = res.error?.message ?? 'Request failed';
    const err = new Error(msg) as Error & { code?: string };
    err.code = res.error?.code;
    throw err;
  }
  return res.data;
}

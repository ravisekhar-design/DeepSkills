/**
 * LAYER: Middleware / BFF
 * Route-level middleware factories. Wrap every route handler with withAuth()
 * to get session injection and unified error handling for free.
 *
 * Usage:
 *   export const GET = withAuth(async (req, session) => {
 *     const data = await myService.getAll(session.user.id);
 *     return ok(data);
 *   });
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { ApiError, UnauthorizedError } from './errors';
import { apiError } from './response';

export interface AuthSession {
  user: {
    id: string;
    email: string;
    name?: string | null;
  };
}

type AuthedHandler<TParams = Record<string, string>> = (
  req: NextRequest,
  session: AuthSession,
  context: { params: Promise<TParams> },
) => Promise<NextResponse>;

/** Wraps a handler: validates session, injects it, catches all errors. */
export function withAuth<TParams = Record<string, string>>(
  handler: AuthedHandler<TParams>,
) {
  return async (
    req: NextRequest,
    context: { params: Promise<TParams> },
  ): Promise<NextResponse> => {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user) throw new UnauthorizedError();
      return await handler(req, session as unknown as AuthSession, context);
    } catch (err) {
      return handleError(err);
    }
  };
}

/** Standalone error handler — use inside routes that manage auth themselves. */
export function handleError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return apiError(err.code, err.message, err.statusCode, err.details);
  }
  const msg =
    err instanceof Error ? err.message : 'An unexpected error occurred';
  console.error('[API Error]', err);
  return apiError('INTERNAL_ERROR', msg, 500);
}

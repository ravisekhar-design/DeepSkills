import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// High-frequency paths to exclude from audit logging — they fire too often to be
// useful in the audit trail and would flood the DB under normal interactive use.
const AUDIT_SKIP = [
  '/api/worksheets',   // execute + patch fires on every shelf change (every ~600ms during editing)
  '/api/logs',         // never audit the log endpoint itself — avoids infinite recursion
];

export async function middleware(req: NextRequest) {
  // Only audit POST/PUT/PATCH/DELETE on /api routes. GET is read-only noise.
  if (!req.nextUrl.pathname.startsWith('/api') || req.method === 'GET') {
    return NextResponse.next();
  }

  // Skip high-frequency and self-referential paths
  if (AUDIT_SKIP.some(p => req.nextUrl.pathname.startsWith(p))) {
    return NextResponse.next();
  }

  try {
    const method = req.method;
    const url = req.nextUrl.pathname + req.nextUrl.search;

    const details: any = {
      timestamp: new Date().toISOString(),
      userAgent: req.headers.get('user-agent') || 'unknown',
      ip: req.headers.get('x-forwarded-for') || 'unknown',
    };

    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          const body = await req.clone().json();
          if (body.password) body.password = '[REDACTED]';
          if (body.apiKey)   body.apiKey   = '[REDACTED]';
          details.payload = body;
        } catch {
          details.payload = '[parse error]';
        }
      }
    }

    // Fire-and-forget — do NOT await.  Awaiting added ~200ms to every API call and
    // blocked the request until the internal HTTP round-trip completed.
    // Forward the Cookie header so the /api/logs session check passes.
    const baseUrl = req.nextUrl.origin;
    fetch(`${baseUrl}/api/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': req.headers.get('cookie') || '',
      },
      body: JSON.stringify({ level: 'info', message: `[${method}] ${url}`, details }),
    }).catch(() => {});  // silently ignore network failures

  } catch {
    // Failsafe — never crash an incoming request because of the audit logger
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};

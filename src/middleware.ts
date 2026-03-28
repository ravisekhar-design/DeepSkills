import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  // Only aggressively log /api mutation endpoints (POST/PUT/PATCH/DELETE).
  // Skip GET requests to avoid flooding the DB with polling traffic.
  // Also skip the logging endpoint itself to prevent infinite recursion.
  if (!req.nextUrl.pathname.startsWith('/api') || req.nextUrl.pathname.startsWith('/api/logs')) {
    return NextResponse.next();
  }

  if (req.method === 'GET') {
    return NextResponse.next();
  }

  try {
    const method = req.method;
    const url = req.nextUrl.pathname + req.nextUrl.search;
    
    // Default details block
    let details: any = {
      timestamp: new Date().toISOString(),
      userAgent: req.headers.get('user-agent') || 'unknown',
      ip: req.headers.get('x-forwarded-for') || 'unknown',
    };

    // If it's a POST/PUT/PATCH, try to clone and extract the body payload.
    // We clone the request because the body can only be read once.
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const clonedReq = req.clone();
      const contentType = req.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        try {
          const bodyJSON = await clonedReq.json();
          // Filter out sensitive data (e.g. passwords) before logging!
          if (bodyJSON.password) bodyJSON.password = '[REDACTED]';
          if (bodyJSON.apiKey) bodyJSON.apiKey = '[REDACTED]';
          
          details.payload = bodyJSON;
        } catch (e) {
          details.payload = '[Error parsing payload]';
        }
      } else {
         try {
            const bodyText = await clonedReq.text();
            details.payload = bodyText ? `[Raw Text Payload: ${bodyText.length} bytes]` : null;
         } catch {
            details.payload = '[Payload extraction failed]';
         }
      }
    }

    // Since Middleware runs on Vercel Edge Runtime, we cannot import Prisma Client directly.
    // Instead, we will forward the extracted payload to our own internal /api/logs route
    // to execute the Prisma insert safely on the Node.js runtime.
    const baseUrl = req.nextUrl.origin;
    await fetch(`${baseUrl}/api/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: 'info',
        message: `API TRAIL: ${method} ${url}`,
        details: details
      })
    }).catch(e => console.error("Middleware Failed to Dispatch Log", e));

  } catch (err) {
    // Failsafe: if the logger errors out, don't crash the incoming request.
    console.error("Audit logger encountered an error", err);
  }

  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: '/api/:path*',
}

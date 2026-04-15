import { NextResponse } from 'next/server';
import { isSmtpConfigured } from '@/lib/email';

// Public endpoint — no auth required (only reveals whether SMTP is set up, not credentials)
export async function GET() {
  return NextResponse.json({ enabled: isSmtpConfigured() });
}

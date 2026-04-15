import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sendOtpEmail, isSmtpConfigured } from '@/lib/email';

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password are required.' }, { status: 400 });
    }

    if (!isSmtpConfigured()) {
      return NextResponse.json(
        { message: 'Email service is not configured on this server.' },
        { status: 503 }
      );
    }

    // Validate credentials before sending OTP
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      // Delay to prevent email enumeration timing attacks
      await new Promise(r => setTimeout(r, 400));
      return NextResponse.json({ message: 'Invalid email or password.' }, { status: 401 });
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      return NextResponse.json({ message: 'Invalid email or password.' }, { status: 401 });
    }

    // Delete any previous unused OTPs for this email
    await prisma.loginOtp.deleteMany({ where: { email, used: false } });

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.loginOtp.create({ data: { email, otp, expiresAt } });

    await sendOtpEmail(email, otp);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[send-otp] error:', error?.message);
    return NextResponse.json(
      { message: 'Failed to send OTP. Please try again.' },
      { status: 500 }
    );
  }
}

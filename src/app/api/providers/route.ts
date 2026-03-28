import { NextResponse } from 'next/server';
import { getDynamicKeys } from '@/lib/keys-injector';

export const dynamic = 'force-dynamic';

export async function GET() {
    const dynamicKeys = await getDynamicKeys();
    
    return NextResponse.json({
        google: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || dynamicKeys.google),
        openai: !!(process.env.OPENAI_API_KEY || dynamicKeys.openai),
        anthropic: !!(process.env.ANTHROPIC_API_KEY || dynamicKeys.anthropic),
        aws: !!((process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) || (dynamicKeys.aws_access_key_id && dynamicKeys.aws_secret_access_key)),
    });
}

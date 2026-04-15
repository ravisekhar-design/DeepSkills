import nodemailer from 'nodemailer';

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in your environment variables.');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const transporter = createTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
    from: `"DeepSkill Nexus" <${from}>`,
    to,
    subject: 'Your DeepSkill Nexus Login Code',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f1117;border-radius:12px;border:1px solid #2a2d3e">
        <div style="text-align:center;margin-bottom:32px">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);border-radius:16px;margin-bottom:16px">
            <span style="font-size:28px">🧠</span>
          </div>
          <h1 style="color:#e2e8f0;font-size:22px;margin:0;font-weight:700">DeepSkill Nexus</h1>
          <p style="color:#94a3b8;margin:8px 0 0;font-size:14px">Secure Cognitive Laboratory Access</p>
        </div>

        <p style="color:#cbd5e1;font-size:15px;line-height:1.6;margin:0 0 24px">
          Your one-time login code is:
        </p>

        <div style="text-align:center;background:#1e2130;border:1px solid #3b4263;border-radius:10px;padding:24px;margin:0 0 24px">
          <span style="font-family:monospace;font-size:40px;font-weight:700;letter-spacing:12px;color:#818cf8">${otp}</span>
        </div>

        <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0">
          This code expires in <strong style="color:#cbd5e1">10 minutes</strong>. Do not share it with anyone.<br>
          If you did not attempt to sign in, you can safely ignore this email.
        </p>
      </div>
    `,
    text: `Your DeepSkill Nexus login code is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
  });
}

export function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

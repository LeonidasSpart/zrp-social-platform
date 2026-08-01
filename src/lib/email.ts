import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Verification Email ──────────────────────────────────────────────
export async function sendVerificationEmail(email: string, token: string) {
  const baseUrl = process.env.NEXTAUTH_URL;
  const link = `${baseUrl}/verify-email?token=${token}`;

  await resend.emails.send({
    from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
    to: email,
    subject: 'Confirm your email address',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h1 style="color: #2563eb;">ZRP Social</h1>
        <p>Welcome to ZRP Social!</p>
        <p>Please confirm your email address by clicking the button below:</p>
        <a href="${link}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px;">Confirm Email</a>
        <p style="margin-top: 20px; font-size: 14px; color: #888;">If you didn't sign up, please ignore this email.</p>
        <p style="font-size: 14px; color: #888;">This link expires in 24 hours.</p>
      </div>
    `,
  });
}

// ─── Password Reset Email ────────────────────────────────────────────
export async function sendPasswordResetEmail(
  to: string,
  name: string | undefined,
  resetLink: string
) {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@zrp.one',
      to,
      subject: 'Reset Your Password – ZRP Social',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; border-radius: 10px;">
          <h1 style="color: #FF2D2D; text-align: center;">Reset Your Password</h1>
          <p style="font-size: 16px; color: #333;">
            Hello ${name || "there"},
          </p>
          <p style="font-size: 16px; color: #333;">
            We received a request to reset your password for your ZRP Social account.
            Click the button below to set a new password.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #FF2D2D; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Reset Password
            </a>
          </div>
          <p style="font-size: 14px; color: #666;">
            If you didn't request this, please ignore this email. This link will expire in 1 hour.
          </p>
          <hr style="border: 1px solid #ddd;" />
          <p style="font-size: 12px; color: #999; text-align: center;">
            ZRP Social – Freedom of speech. 35% of profits to charity.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      throw new Error(error.message);
    }

    return data;
  } catch (error) {
    console.error("Failed to send email:", error);
    throw error;
  }
}

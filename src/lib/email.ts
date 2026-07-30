import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

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

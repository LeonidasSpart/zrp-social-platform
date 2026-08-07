import { Resend } from 'resend';

let _resend: Resend | null = null;

function getResend() {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn('RESEND_API_KEY is not set – email sending will fail.');
      // Return a dummy instance that will throw when used, but won't break the build
      return new Resend('dummy');
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
}

// ─── Generic Email Sender (used by notifications) ──────────────────
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set – email not sent');
    return;
  }

  try {
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@zrp.one',
      to,
      subject,
      html,
    });
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

// ─── Professional notification email template ──────────────────────
export function buildNotificationEmail({
  recipientName,
  actorName,
  actorUsername,
  action,
  postContent,
  postUrl,
  actionEmoji = '🔔',
}: {
  recipientName: string;
  actorName: string;
  actorUsername: string;
  action: string;
  postContent?: string;
  postUrl?: string;
  actionEmoji?: string;
}) {
  const appUrl = process.env.NEXTAUTH_URL || 'https://zrp.one';
  const settingsUrl = `${appUrl}/settings`;
  const logoUrl = `${appUrl}/logo.png`;

  const truncatedContent = postContent && postContent.length > 120
    ? postContent.slice(0, 120) + '…'
    : postContent;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Notification from ZRP</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f6f9fc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #ffffff;
      border-radius: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }
    .header {
      text-align: center;
      padding: 20px 0 10px;
      border-bottom: 2px solid #f1f5f9;
    }
    .header img {
      height: 40px;
      width: auto;
    }
    .header h1 {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      margin: 8px 0 0;
      letter-spacing: -0.5px;
    }
    .content {
      padding: 24px 20px 20px;
    }
    .greeting {
      font-size: 16px;
      font-weight: 600;
      margin: 0 0 12px;
      color: #0f172a;
    }
    .notification-box {
      background-color: #f8fafc;
      border-radius: 12px;
      padding: 16px 20px;
      margin: 16px 0;
      border-left: 4px solid #FF2D2D;
    }
    .notification-box .emoji {
      font-size: 28px;
      margin-right: 8px;
    }
    .notification-box .action-text {
      font-size: 15px;
      color: #1e293b;
      line-height: 1.5;
    }
    .notification-box .action-text strong {
      color: #0f172a;
    }
    .notification-box .post-preview {
      margin-top: 10px;
      padding: 12px 16px;
      background-color: #ffffff;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      color: #334155;
      font-size: 14px;
      line-height: 1.6;
    }
    .cta-button {
      display: inline-block;
      background-color: #FF2D2D;
      color: #ffffff !important;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 15px;
      margin: 20px 0 8px;
      transition: background-color 0.2s;
      text-align: center;
    }
    .cta-button:hover {
      background-color: #e02424;
    }
    .footer {
      padding: 20px 20px 10px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 13px;
      color: #94a3b8;
    }
    .footer a {
      color: #FF2D2D;
      text-decoration: none;
    }
    .footer .charity {
      margin-top: 6px;
      font-size: 12px;
      color: #64748b;
    }
    .footer .charity strong {
      color: #FF2D2D;
    }
    @media (max-width: 480px) {
      .container { padding: 12px; }
      .content { padding: 16px 12px; }
      .notification-box { padding: 12px 16px; }
      .cta-button { display: block; text-align: center; }
    }
  </style>
</head>
<body>
  <div style="max-width:600px; margin:0 auto; padding:20px 10px; background-color:#f6f9fc;">
    <div class="container">
      <!-- Header -->
      <div class="header">
        <img src="${logoUrl}" alt="ZRP" style="height:40px; width:auto;" />
        <h1>ZRP Social</h1>
      </div>

      <!-- Content -->
      <div class="content">
        <p class="greeting">Hello ${recipientName || 'there'},</p>

        <div class="notification-box">
          <div style="display:flex; align-items:flex-start;">
            <span class="emoji">${actionEmoji}</span>
            <div>
              <div class="action-text">
                <strong>${actorName}</strong> <span style="color:#64748b;">(@${actorUsername})</span> ${action}.
              </div>
              ${truncatedContent ? `
                <div class="post-preview">
                  “${truncatedContent}”
                </div>
              ` : ''}
            </div>
          </div>
        </div>

        ${postUrl ? `
          <div style="text-align:center; margin: 16px 0 8px;">
            <a href="${postUrl}" class="cta-button">View it here</a>
          </div>
        ` : ''}

        <p style="font-size:14px; color:#64748b; margin-top:20px; text-align:center;">
          You received this email because you have notifications enabled.
          <br/>
          <a href="${settingsUrl}" style="color:#FF2D2D; text-decoration:underline;">Manage your preferences</a>
        </p>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p>
          <a href="${appUrl}">ZRP Social</a> · 
          <a href="${appUrl}/privacy">Privacy</a> · 
          <a href="${appUrl}/terms">Terms</a>
        </p>
        <div class="charity">
          <strong>35%</strong> of profits go to orphans, schools, hospitals & climate relief.
        </div>
        <p style="margin-top:8px; font-size:12px; color:#cbd5e1;">
          &copy; ${new Date().getFullYear()} ZRP. All rights reserved.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

// ─── Verification Email ──────────────────────────────────────────────
export async function sendVerificationEmail(
  email: string,
  token: string,
  customUrl?: string
) {
  const resend = getResend();
  const baseUrl = process.env.NEXTAUTH_URL;
  const link = customUrl || `${baseUrl}/verify-email?token=${token}`;

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
  const resend = getResend();
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

// ─── NEW: Team Invitation Email ─────────────────────────────────────
export async function sendTeamInvitation({
  to,
  accountOwnerName,
  role,
  teamLink,
}: {
  to: string;
  accountOwnerName: string;
  role: string;
  teamLink: string;
}) {
  const resend = getResend();
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@zrp.one',
      to,
      subject: `You've been added to a team on ZRP Social`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0;">
          <h1 style="color: #FF2D2D; text-align: center;">Team Invitation</h1>
          <p style="font-size: 16px; color: #333;">
            Hello,
          </p>
          <p style="font-size: 16px; color: #333;">
            <strong>${accountOwnerName}</strong> has added you to their team as a <strong>${role}</strong>.
          </p>
          <p style="font-size: 16px; color: #333;">
            You now have access to team features. Click the button below to view your team dashboard:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${teamLink}" style="background-color: #FF2D2D; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
              View Team Dashboard
            </a>
          </div>
          <p style="font-size: 14px; color: #666;">
            If you have any questions, contact your team owner directly.
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
    console.error("Failed to send team invitation email:", error);
    throw error;
  }
}

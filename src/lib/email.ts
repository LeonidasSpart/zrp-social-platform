import { Resend } from "resend";
// Construct lazily so importing this module never crashes when the
// RESEND_API_KEY is missing.
let resend: Resend | null = null;
function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set: email not sent");
    return null;
  }
  if (!resend) {
    resend = new Resend(apiKey);
  }
  return resend;
}
// ─── Generic Email Sender ───────────────────────────────────────────
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const client = getResendClient();
  if (!client) {
    return;
  }
  try {
    const { data, error } = await client.emails.send({
      from: process.env.EMAIL_FROM || "noreply@zrp.one",
      to,
      subject,
      html,
    });
    if (error) {
      console.error("Resend email error:", error);
      throw new Error(error.message);
    }
    console.log("Email sent successfully:", {
      to,
      subject,
      id: data?.id,
    });
    return data;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}
// ─── Professional Notification Email ────────────────────────────────
export function buildNotificationEmail({
  recipientName,
  actorName,
  actorUsername,
  action,
  postContent,
  postUrl,
  actionEmoji = "🔔",
}: {
  recipientName: string;
  actorName: string;
  actorUsername: string;
  action: string;
  postContent?: string;
  postUrl?: string;
  actionEmoji?: string;
}) {
  const appUrl = process.env.NEXTAUTH_URL || "https://zrp.one";
  const settingsUrl = `${appUrl}/settings`;
  const logoUrl = `${appUrl}/logo.png`;
  const truncatedContent =
    postContent && postContent.length > 120
      ? postContent.slice(0, 120) + "…"
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
      text-align: center;
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
      .container {
        padding: 12px;
      }
      .content {
        padding: 16px 12px;
      }
      .notification-box {
        padding: 12px 16px;
      }
      .cta-button {
        display: block;
        text-align: center;
      }
    }
  </style>
</head>
<body>
  <div style="max-width:600px; margin:0 auto; padding:20px 10px; background-color:#f6f9fc;">
    <div class="container">
      <div class="header">
        <img src="${logoUrl}" alt="ZRP" style="height:40px; width:auto;" />
        <h1>ZRP Social</h1>
      </div>
      <div class="content">
        <p class="greeting">Hello ${recipientName || "there"},</p>
        <div class="notification-box">
          <div style="display:flex; align-items:flex-start;">
            <span class="emoji">${actionEmoji}</span>
            <div>
              <div class="action-text">
                <strong>${actorName}</strong>
                <span style="color:#64748b;">(@${actorUsername})</span>
                ${action}.
              </div>
              ${
                truncatedContent
                  ? `
                <div class="post-preview">
                  “${truncatedContent}”
                </div>
              `
                  : ""
              }
            </div>
          </div>
        </div>
        ${
          postUrl
            ? `
          <div style="text-align:center; margin:16px 0 8px;">
            <a href="${postUrl}" class="cta-button">
              View it here
            </a>
          </div>
        `
            : ""
        }
        <p style="font-size:14px; color:#64748b; margin-top:20px; text-align:center;">
          You received this email because you have notifications enabled.
          <br/>
          <a href="${settingsUrl}" style="color:#FF2D2D; text-decoration:underline;">
            Manage your preferences
          </a>
        </p>
      </div>
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
// ─── Verification Email ─────────────────────────────────────────────
export async function sendVerificationEmail(
  email: string,
  token: string,
  customUrl?: string
) {
  const client = getResendClient();
  if (!client) {
    console.error(
      "VERIFICATION EMAIL NOT SENT: RESEND_API_KEY is missing."
    );
    return;
  }
  // Always have a valid production fallback.
  const baseUrl =
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    "https://zrp.one";
  const link =
    customUrl ||
    `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  console.log("Sending verification email:", {
    to: email,
    linkBase: baseUrl,
  });
  try {
    const { data, error } = await client.emails.send({
      from:
        process.env.EMAIL_FROM ||
        "noreply@zrp.one",
      to: email,
      subject: "Verify your ZRP Social account",
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your ZRP Social account</title>
</head>
<body style="
  margin:0;
  padding:0;
  background:#f6f9fc;
  font-family:Arial,Helvetica,sans-serif;
">
  <div style="
    max-width:600px;
    margin:0 auto;
    padding:40px 20px;
  ">
    <div style="
      background:#ffffff;
      border-radius:16px;
      padding:40px 30px;
      border:1px solid #e2e8f0;
      text-align:center;
    ">
      <img
        src="${baseUrl}/logo.png"
        alt="ZRP Social"
        style="height:50px; width:auto; margin-bottom:20px;"
      />
      <h1 style="
        margin:0 0 15px;
        color:#111827;
        font-size:28px;
      ">
        Welcome to ZRP Social
      </h1>
      <p style="
        color:#4b5563;
        font-size:16px;
        line-height:1.6;
        margin:0 0 25px;
      ">
        Thank you for creating your ZRP Social account.
        Please verify your email address to activate your account.
      </p>
      <a
        href="${link}"
        style="
          display:inline-block;
          background:#FF2D2D;
          color:#ffffff;
          text-decoration:none;
          padding:14px 30px;
          border-radius:8px;
          font-size:16px;
          font-weight:bold;
        "
      >
        Verify My Email
      </a>
      <p style="
        margin:30px 0 10px;
        color:#6b7280;
        font-size:13px;
        line-height:1.5;
      ">
        This verification link expires in 24 hours.
      </p>
      <p style="
        margin:0;
        color:#9ca3af;
        font-size:12px;
        line-height:1.5;
      ">
        If you did not create a ZRP Social account,
        you can safely ignore this email.
      </p>
      <hr style="
        border:none;
        border-top:1px solid #e5e7eb;
        margin:30px 0 20px;
      " />
      <p style="
        margin:0;
        color:#9ca3af;
        font-size:12px;
      ">
        ZRP Social ·
        <a
          href="${baseUrl}"
          style="color:#FF2D2D; text-decoration:none;"
        >
          zrp.one
        </a>
      </p>
    </div>
  </div>
</body>
</html>
      `,
    });
    if (error) {
      console.error("RESEND VERIFICATION ERROR:", error);
      throw new Error(error.message);
    }
    console.log("VERIFICATION EMAIL SENT SUCCESSFULLY:", {
      to: email,
      id: data?.id,
    });
    return data;
  } catch (error) {
    console.error(
      "FAILED TO SEND VERIFICATION EMAIL:",
      error
    );
    throw error;
  }
}
// ─── Password Reset Email ────────────────────────────────────────────
export async function sendPasswordResetEmail(
  to: string,
  name: string | undefined,
  resetLink: string
) {
  const client = getResendClient();
  if (!client) {
    console.warn(
      "RESEND_API_KEY not set: password reset email not sent"
    );
    return;
  }
  try {
    const { data, error } = await client.emails.send({
      from:
        process.env.EMAIL_FROM ||
        "noreply@zrp.one",
      to,
      subject: "Reset Your Password: ZRP Social",
      html: `
        <div style="
          font-family:Arial,sans-serif;
          max-width:600px;
          margin:0 auto;
          padding:20px;
          background-color:#f9f9f9;
          border-radius:10px;
        ">
          <h1 style="color:#FF2D2D; text-align:center;">
            Reset Your Password
          </h1>
          <p style="font-size:16px; color:#333;">
            Hello ${name || "there"},
          </p>
          <p style="font-size:16px; color:#333;">
            We received a request to reset your password for your
            ZRP Social account.
            Click the button below to set a new password.
          </p>
          <div style="text-align:center; margin:30px 0;">
            <a
              href="${resetLink}"
              style="
                background-color:#FF2D2D;
                color:white;
                padding:12px 24px;
                text-decoration:none;
                border-radius:8px;
                font-weight:bold;
              "
            >
              Reset Password
            </a>
          </div>
          <p style="font-size:14px; color:#666;">
            If you didn't request this, please ignore this email.
            This link will expire in 1 hour.
          </p>
          <hr style="border:1px solid #ddd;" />
          <p style="
            font-size:12px;
            color:#999;
            text-align:center;
          ">
            ZRP Social: Freedom of speech.
            35% of profits to charity.
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
// ─── Team Invitation Email ──────────────────────────────────────────
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
  const client = getResendClient();
  if (!client) {
    console.warn(
      "RESEND_API_KEY not set: team invitation email not sent"
    );
    return;
  }
  try {
    const { data, error } = await client.emails.send({
      from:
        process.env.EMAIL_FROM ||
        "noreply@zrp.one",
      to,
      subject: "You've been added to a team on ZRP Social",
      html: `
        <div style="
          font-family:Arial,sans-serif;
          max-width:600px;
          margin:0 auto;
          padding:20px;
          background-color:#ffffff;
          border-radius:10px;
          border:1px solid #e2e8f0;
        ">
          <h1 style="
            color:#FF2D2D;
            text-align:center;
          ">
            Team Invitation
          </h1>
          <p style="font-size:16px; color:#333;">
            Hello,
          </p>
          <p style="font-size:16px; color:#333;">
            <strong>${accountOwnerName}</strong>
            has added you to their team as a
            <strong>${role}</strong>.
          </p>
          <p style="font-size:16px; color:#333;">
            You now have access to team features.
            Click the button below to view your team dashboard:
          </p>
          <div style="
            text-align:center;
            margin:30px 0;
          ">
            <a
              href="${teamLink}"
              style="
                background-color:#FF2D2D;
                color:white;
                padding:12px 24px;
                text-decoration:none;
                border-radius:8px;
                font-weight:bold;
              "
            >
              View Team Dashboard
            </a>
          </div>
          <p style="font-size:14px; color:#666;">
            If you have any questions,
            contact your team owner directly.
          </p>
          <hr style="border:1px solid #ddd;" />
          <p style="
            font-size:12px;
            color:#999;
            text-align:center;
          ">
            ZRP Social: Freedom of speech.
            35% of profits to charity.
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

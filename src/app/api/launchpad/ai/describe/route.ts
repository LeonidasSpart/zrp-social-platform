export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { aiUsageDateKey, reserveAiMessage, releaseAiMessage, recordAiTokens } from "@/lib/ai-quota";
import OpenAI from "openai";

/*
 * ZRP Launchpad, phase 10: AI token description generator.
 *
 * Scoped to TEXT only (name/symbol/description/tagline suggestions),
 * not image generation - no image-generation provider is configured
 * anywhere in this codebase (only DEEPSEEK_API_KEY, text-only), and
 * "never fake an integration" means not building a UI for a provider
 * that doesn't exist. Reuses the exact same DeepSeek client and daily
 * AIDailyUsage quota as /api/ai/chat (a shared budget across every AI
 * feature, not a second parallel quota system) - see src/lib/ai-quota.ts
 * for why the slot is reserved atomically before the model call.
 */

const MAX_THEME_CHARS = 300;
const AI_IP_RATE_LIMIT = { limit: 20, window: 60, type: "ai-describe" };

const RATE_LIMITS = {
  free: { messagesPerDay: 10, maxTokens: 500 },
  pro: { messagesPerDay: 50, maxTokens: 1000 },
  business: { messagesPerDay: 200, maxTokens: 2000 },
  enterprise: { messagesPerDay: 1000, maxTokens: 4000 },
};

function getDeepSeek() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");
  return new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ipLimit = await rateLimit(req, AI_IP_RATE_LIMIT);
    if (!ipLimit.success) return ipLimit.response;

    const body = await req.json().catch(() => null);
    const theme = typeof body?.theme === "string" ? body.theme.trim() : "";
    if (!theme) {
      return NextResponse.json({ error: "Describe the token's theme or purpose." }, { status: 400 });
    }
    if (theme.length > MAX_THEME_CHARS) {
      return NextResponse.json({ error: `Theme too long (max ${MAX_THEME_CHARS} characters).` }, { status: 400 });
    }

    const plan = session.user.plan || "free";
    const limits = RATE_LIMITS[plan as keyof typeof RATE_LIMITS] || RATE_LIMITS.free;
    const today = aiUsageDateKey();

    // ⚠️ SECURITY: same atomic-reservation-before-the-model-call pattern
    // as /api/ai/chat - see src/lib/ai-quota.ts's doc comment for why a
    // check-then-increment here would let concurrent requests all pass.
    const reservation = await reserveAiMessage(session.user.id, limits.messagesPerDay, today);
    if (!reservation.ok) {
      return NextResponse.json(
        { error: `Daily AI limit reached (${limits.messagesPerDay} requests). Upgrade your plan for more.`, limit: limits.messagesPerDay, used: reservation.used },
        { status: 429 }
      );
    }

    try {
      const deepseek = getDeepSeek();
      const response = await deepseek.responses.create({
        model: "deepseek-v4-flash",
        input: [
          {
            type: "message",
            role: "developer",
            content:
              "You write short, punchy marketing copy for new Solana token launches on ZRP Launchpad. " +
              "Given a theme, respond with exactly three lines, no extra commentary: " +
              "Name: <a short token name>\nSymbol: <a 3-6 letter uppercase ticker>\nDescription: <one marketing sentence, under 200 characters>",
          },
          { type: "message", role: "user", content: theme },
        ],
        stream: false,
        temperature: 0.8,
        max_output_tokens: Math.min(limits.maxTokens, 300),
      });

      const text = (response as any).output_text || "";
      if (!text.trim()) throw new Error("Empty response from model.");

      await recordAiTokens(session.user.id, Math.floor(text.length / 4), today);

      return NextResponse.json({ suggestion: text.trim(), remaining: Math.max(limits.messagesPerDay - reservation.used, 0) });
    } catch (modelError) {
      // The model call failed after the slot was reserved - hand it
      // back so a provider outage doesn't eat the user's daily quota.
      await releaseAiMessage(session.user.id, today);
      console.error("AI description generation error:", modelError);
      return NextResponse.json({ error: "Failed to generate a suggestion. Please try again." }, { status: 502 });
    }
  } catch (error) {
    console.error("AI describe route error:", error);
    return NextResponse.json({ error: "Failed to generate a suggestion. Please try again." }, { status: 500 });
  }
}

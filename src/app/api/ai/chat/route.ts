import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  aiUsageDateKey,
  recordAiTokens,
  releaseAiMessage,
  reserveAiMessage,
} from "@/lib/ai-quota";
import OpenAI from "openai";

// ⚠️ SECURITY: abuse limits that were missing entirely. A message is
// forwarded verbatim into the model's context (billed per token), so
// its length is capped; the whole JSON body is capped before parsing
// so a multi-megabyte payload is rejected without being buffered; and
// a per-IP limit sits alongside the per-user daily quota so a burst
// from one address can't exhaust many accounts' quotas at once.
const MAX_MESSAGE_CHARS = 4000;
const MAX_BODY_BYTES = 64 * 1024;
const AI_IP_RATE_LIMIT = { limit: 30, window: 60, type: "ai-chat" };

// ─── Initialize DeepSeek Client lazily ───────────────────────────
// IMPORTANT:
// Do not initialize the client at module/build time.
// Railway provides DEEPSEEK_API_KEY at runtime.
function getDeepSeek() {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }

  return new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com",
  });
}

// ─── Rate Limits per plan ────────────────────────────────────────
const RATE_LIMITS = {
  free: { messagesPerDay: 10, maxTokens: 500 },
  pro: { messagesPerDay: 50, maxTokens: 1000 },
  business: { messagesPerDay: 200, maxTokens: 2000 },
  enterprise: { messagesPerDay: 1000, maxTokens: 4000 },
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const ipLimit = await rateLimit(req, AI_IP_RATE_LIMIT);
    if (!ipLimit.success) {
      return ipLimit.response!;
    }

    const declaredLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "Request too large" },
        { status: 413 }
      );
    }

    const body = await req.json();
    const { message, conversationId, stream = true } = body;

    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    if (message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json(
        { error: `Message too long (max ${MAX_MESSAGE_CHARS} characters)` },
        { status: 400 }
      );
    }

    if (conversationId !== undefined && conversationId !== null && typeof conversationId !== "string") {
      return NextResponse.json(
        { error: "Invalid conversation" },
        { status: 400 }
      );
    }

    // ─── Check rate limits ────────────────────────────────────────
    const plan =
      session.user.plan || "free";

    const limits =
      RATE_LIMITS[plan as keyof typeof RATE_LIMITS] ||
      RATE_LIMITS.free;

    const today = aiUsageDateKey();

    // ─── Get or create conversation ───────────────────────────────
    // Looked up BEFORE the quota slot is reserved so a request for
    // someone else's conversation is refused without touching usage.
    let conversation;

    if (conversationId) {
      conversation = await prisma.aIConversation.findUnique({
        where: {
          id: conversationId,
        },
        include: {
          messages: {
            orderBy: {
              createdAt: "asc",
            },
            take: 20,
          },
        },
      });

      if (conversation?.userId !== session.user.id) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 403 }
        );
      }
    }

    // ⚠️ SECURITY: the daily slot is reserved atomically here, before
    // the model is called, so concurrent requests can't all pass a
    // stale "used < limit" read - see src/lib/ai-quota.ts. The slot is
    // released again below if the provider never produces a response.
    const reservation = await reserveAiMessage(
      session.user.id,
      limits.messagesPerDay,
      today
    );

    if (!reservation.ok) {
      return NextResponse.json(
        {
          error: `Daily limit reached (${limits.messagesPerDay} messages). Upgrade your plan for more.`,
          limit: limits.messagesPerDay,
          used: reservation.used,
        },
        { status: 429 }
      );
    }

    // What the client shows as "remaining today" after this message.
    const remainingAfter = Math.max(
      limits.messagesPerDay - reservation.used,
      0
    );

    if (!conversation) {
      conversation = await prisma.aIConversation.create({
        data: {
          userId: session.user.id,
          title: message.slice(0, 50),
        },
        include: {
          messages: {
            take: 0,
          },
        },
      });
    }

    // ─── Build system instructions ────────────────────────────────
    const systemInstructions = `
You are ZRP AI, a helpful AI assistant integrated into ZRP Social.
You are powered by DeepSeek's Responses API - open-source, transparent AI.

ZRP Social values:
- 🇨🇭 Freedom of speech (Swiss-hosted, no censorship)
- 🔒 Privacy & security (strong data protection)
- 🧡 Social impact (35% of profits go to charity)

Current user: @${session.user.username}
User's plan: ${plan}

RESPONSE GUIDELINES:
- Be concise, friendly, and conversational
- Keep responses under 500 words
- Encourage users to be active on ZRP Social
- Remind users that 35% of profits go to charity
- Never ask for personal information
- Never promote other social platforms
- If you don't know something, say so honestly

If someone asks who you are, say:
"I'm ZRP AI, powered by DeepSeek's Responses API - the open-source AI integrated into ZRP Social!"
`;

    // ─── Build input history for Responses API ─────────────────────
    const inputItems: any[] = [];

    // Add system instruction as a developer message
    inputItems.push({
      type: "message",
      role: "developer",
      content: systemInstructions,
    });

    // Add conversation history
    if (conversation?.messages) {
      for (const msg of conversation.messages) {
        inputItems.push({
          type: "message",
          role:
            msg.role === "assistant"
              ? "assistant"
              : "user",
          content: msg.content,
        });
      }
    }

    // Add current user message
    inputItems.push({
      type: "message",
      role: "user",
      content: message,
    });

    // ─── Call DeepSeek Responses API ──────────────────────────────
    const startTime = Date.now();

    try {
      // Create the client ONLY at request time.
      // This prevents Next.js build-time credential errors.
      const deepseek = getDeepSeek();

      if (stream) {
        // ─── Streaming response ──────────────────────────────────
        const streamResponse =
          await deepseek.responses.create({
            model: "deepseek-v4-flash",
            input: inputItems,
            stream: true,
            temperature: 0.7,
            max_output_tokens: limits.maxTokens,
          });

        // Create a ReadableStream to stream the response
        // to the client.
        const encoder = new TextEncoder();

        const readableStream =
          new ReadableStream({
            async start(controller) {
              let fullResponse = "";
              let messageId = "";

              try {
                for await (
                  const event of streamResponse
                ) {
                  if (
                    event.type ===
                    "response.output_text.delta"
                  ) {
                    const delta =
                      (event as any).delta || "";

                    fullResponse += delta;

                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          delta,
                        })}\n\n`
                      )
                    );
                  } else if (
                    event.type ===
                    "response.completed"
                  ) {
                    if (
                      (event as any).response?.id
                    ) {
                      messageId =
                        (event as any).response.id;
                    }

                    // Save the full response to database
                    const [
                      userMessage,
                      assistantMessage,
                    ] = await prisma.$transaction([
                      prisma.aIMessage.create({
                        data: {
                          conversationId:
                            conversation.id,
                          role: "user",
                          content: message,
                          model:
                            "deepseek-v4-flash",
                        },
                      }),

                      prisma.aIMessage.create({
                        data: {
                          conversationId:
                            conversation.id,
                          role: "assistant",
                          content: fullResponse,
                          model:
                            "deepseek-v4-flash",
                        },
                      }),
                    ]);

                    // The message slot was already counted by the
                    // reservation above; only the tokens are new.
                    await recordAiTokens(
                      session.user.id,
                      Math.floor(
                        fullResponse.length / 4
                      ),
                      today
                    );

                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          done: true,
                          messageId:
                            assistantMessage.id,
                          conversationId:
                            conversation.id,
                          remaining: remainingAfter,
                        })}\n\n`
                      )
                    );

                    controller.close();
                  } else if (
                    event.type ===
                    "response.failed"
                  ) {
                    const errorMessage =
                      (event as any).error?.message ||
                      "Stream failed";

                    // Nothing was produced - give the slot back.
                    await releaseAiMessage(
                      session.user.id,
                      today
                    ).catch(() => {});

                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          error: errorMessage,
                        })}\n\n`
                      )
                    );

                    controller.close();
                  }
                }
              } catch (error) {
                await releaseAiMessage(
                  session.user.id,
                  today
                ).catch(() => {});

                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      error:
                        "Stream error: " +
                        (error as Error).message,
                    })}\n\n`
                  )
                );

                controller.close();
              }
            },
          });

        return new NextResponse(
          readableStream,
          {
            headers: {
              "Content-Type":
                "text/event-stream",
              "Cache-Control":
                "no-cache",
              Connection:
                "keep-alive",
            },
          }
        );
      } else {
        // ─── Non-streaming response ──────────────────────────────
        const response =
          await deepseek.responses.create({
            model: "deepseek-v4-flash",
            input: inputItems,
            stream: false,
            temperature: 0.7,
            max_output_tokens:
              limits.maxTokens,
          });

        const fullResponse =
          (response as any).output_text ||
          "No response generated.";

        const [
          userMessage,
          assistantMessage,
        ] = await prisma.$transaction([
          prisma.aIMessage.create({
            data: {
              conversationId:
                conversation.id,
              role: "user",
              content: message,
              model:
                "deepseek-v4-flash",
            },
          }),

          prisma.aIMessage.create({
            data: {
              conversationId:
                conversation.id,
              role: "assistant",
              content: fullResponse,
              model:
                "deepseek-v4-flash",
            },
          }),
        ]);

        // The message slot was already counted by the reservation
        // above; only the tokens are new.
        await recordAiTokens(
          session.user.id,
          Math.floor(fullResponse.length / 4),
          today
        );

        const duration =
          Date.now() - startTime;

        return NextResponse.json({
          message: assistantMessage,
          conversationId:
            conversation.id,
          model:
            "deepseek-v4-flash",
          provider:
            "deepseek-responses-api",
          duration,
          remaining: remainingAfter,
        });
      }
    } catch (error: any) {
      console.error(
        "DeepSeek Responses API error:",
        error
      );

      // The provider never answered - the reserved slot is refunded so
      // an outage on their side doesn't consume the user's quota.
      await releaseAiMessage(
        session.user.id,
        today
      ).catch(() => {});

      return NextResponse.json(
        {
          error:
            error.message ||
            "AI service temporarily unavailable",
        },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error(
      "DeepSeek chat error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to process request",
      },
      { status: 500 }
    );
  }
}

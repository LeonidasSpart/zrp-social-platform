import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import OpenAI from "openai";

// ─── Initialize DeepSeek Client ──────────────────────────────────
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { message, conversationId, stream = true } = body;

    if (!message?.trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // ─── Check rate limits ──────────────────────────────────────────
    const plan = session.user.plan || "free";
    const limits = RATE_LIMITS[plan as keyof typeof RATE_LIMITS] || RATE_LIMITS.free;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const usage = await prisma.aIDailyUsage.findUnique({
      where: {
        userId_date: {
          userId: session.user.id,
          date: today,
        },
      },
    });

    if (usage && usage.messages >= limits.messagesPerDay) {
      return NextResponse.json(
        {
          error: `Daily limit reached (${limits.messagesPerDay} messages). Upgrade your plan for more.`,
          limit: limits.messagesPerDay,
          used: usage.messages,
        },
        { status: 429 }
      );
    }

    // ─── Get or create conversation ─────────────────────────────────
    let conversation;
    if (conversationId) {
      conversation = await prisma.aIConversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            take: 20,
          },
        },
      });
      if (conversation?.userId !== session.user.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    } else {
      conversation = await prisma.aIConversation.create({
        data: {
          userId: session.user.id,
          title: message.slice(0, 50),
        },
        include: { messages: { take: 0 } },
      });
    }

    // ─── Build system instructions ──────────────────────────────────
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

If someone asks who you are, say: "I'm ZRP AI, powered by DeepSeek's Responses API - the open-source AI integrated into ZRP Social!"
`;

    // ─── Build input history for Responses API ──────────────────────
    // The Responses API expects a different format
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
          role: msg.role === "assistant" ? "assistant" : "user",
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

    // ─── Call DeepSeek Responses API ────────────────────────────────
    const startTime = Date.now();

    try {
      if (stream) {
        // ─── Streaming response ────────────────────────────────────
        const streamResponse = await deepseek.responses.create({
          model: "deepseek-v4-flash",
          input: inputItems,
          stream: true,
          temperature: 0.7,
          max_output_tokens: limits.maxTokens,
        });

        // Create a ReadableStream to stream the response to the client
        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
          async start(controller) {
            let fullResponse = "";
            let messageId = "";

            try {
              for await (const event of streamResponse) {
                if (event.type === "response.output_text.delta") {
                  const delta = event.delta || "";
                  fullResponse += delta;
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`)
                  );
                } else if (event.type === "response.completed") {
                  if (event.response?.id) {
                    messageId = event.response.id;
                  }
                  // Save the full response to database
                  const [userMessage, assistantMessage] = await prisma.$transaction([
                    prisma.aIMessage.create({
                      data: {
                        conversationId: conversation.id,
                        role: "user",
                        content: message,
                        model: "deepseek-v4-flash",
                      },
                    }),
                    prisma.aIMessage.create({
                      data: {
                        conversationId: conversation.id,
                        role: "assistant",
                        content: fullResponse,
                        model: "deepseek-v4-flash",
                      },
                    }),
                  ]);

                  await prisma.aIDailyUsage.upsert({
                    where: {
                      userId_date: {
                        userId: session.user.id,
                        date: today,
                      },
                    },
                    update: {
                      messages: { increment: 1 },
                      tokensUsed: { increment: Math.floor(fullResponse.length / 4) },
                    },
                    create: {
                      userId: session.user.id,
                      date: today,
                      messages: 1,
                      tokensUsed: Math.floor(fullResponse.length / 4),
                    },
                  });

                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        done: true,
                        messageId: assistantMessage.id,
                        conversationId: conversation.id,
                        remaining:
                          limits.messagesPerDay - (usage?.messages || 0) - 1,
                      })}\n\n`
                    )
                  );
                  controller.close();
                } else if (event.type === "response.failed") {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        error: event.error?.message || "Stream failed",
                      })}\n\n`
                    )
                  );
                  controller.close();
                }
              }
            } catch (error) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    error: "Stream error: " + (error as Error).message,
                  })}\n\n`
                )
              );
              controller.close();
            }
          },
        });

        return new NextResponse(readableStream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      } else {
        // ─── Non-streaming response ──────────────────────────────
        const response = await deepseek.responses.create({
          model: "deepseek-v4-flash",
          input: inputItems,
          stream: false,
          temperature: 0.7,
          max_output_tokens: limits.maxTokens,
        });

        const fullResponse = response.output_text || "No response generated.";

        const [userMessage, assistantMessage] = await prisma.$transaction([
          prisma.aIMessage.create({
            data: {
              conversationId: conversation.id,
              role: "user",
              content: message,
              model: "deepseek-v4-flash",
            },
          }),
          prisma.aIMessage.create({
            data: {
              conversationId: conversation.id,
              role: "assistant",
              content: fullResponse,
              model: "deepseek-v4-flash",
            },
          }),
        ]);

        await prisma.aIDailyUsage.upsert({
          where: {
            userId_date: {
              userId: session.user.id,
              date: today,
            },
          },
          update: {
            messages: { increment: 1 },
            tokensUsed: { increment: Math.floor(fullResponse.length / 4) },
          },
          create: {
            userId: session.user.id,
            date: today,
            messages: 1,
            tokensUsed: Math.floor(fullResponse.length / 4),
          },
        });

        const duration = Date.now() - startTime;

        return NextResponse.json({
          message: assistantMessage,
          conversationId: conversation.id,
          model: "deepseek-v4-flash",
          provider: "deepseek-responses-api",
          duration,
          remaining: limits.messagesPerDay - (usage?.messages || 0) - 1,
        });
      }
    } catch (error: any) {
      console.error("DeepSeek Responses API error:", error);
      return NextResponse.json(
        { error: error.message || "AI service temporarily unavailable" },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error("DeepSeek chat error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

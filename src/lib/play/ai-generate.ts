import OpenAI from "openai";
import type { PlayChallengeType } from "@prisma/client";
import { validateChallengeContent } from "./scoring";
import { getGame } from "./registry";

// Same lazy-init pattern as src/app/api/ai/chat/route.ts (ZRP AI): the
// client must not be constructed at build time, only per-request, so a
// missing DEEPSEEK_API_KEY at build time never breaks the production
// build.
function getDeepSeek() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");
  return new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
}

interface GeneratedChallenge {
  title: string;
  description: string;
  content: unknown;
}

// Generates a complete, ready-to-play challenge from a short topic
// description. Throws on any failure (missing key, malformed model
// output, failed validation) rather than returning a partial/silent
// result - the caller (POST /api/play/challenges/generate) surfaces
// the real error to the user instead of pretending nothing happened.
export async function generateChallengeContent(
  topic: string,
  type: PlayChallengeType,
  difficulty: string
): Promise<GeneratedChallenge> {
  const game = getGame(type);
  if (!game.aiGenerationSupported || !game.aiInstructions) {
    throw new Error("AI generation isn't available for this challenge type.");
  }

  const deepseek = getDeepSeek();

  const systemPrompt = `You are a game content generator for ZRP PLAY, a social entertainment hub. Generate a fun, family-friendly ${type.toLowerCase()} challenge at ${difficulty} difficulty about the given topic. ${game.aiInstructions} Respond with ONLY the JSON object, no other text. Never include real people's private information, hate speech, or explicit content.`;

  const response = await deepseek.chat.completions.create({
    model: "deepseek-v4-flash",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Topic: ${topic}` },
    ],
    temperature: 0.8,
    max_tokens: 1200,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("AI returned an empty response");

  let parsed: GeneratedChallenge;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI returned a response that could not be parsed");
  }

  if (!parsed.title || !parsed.content) {
    throw new Error("AI response was missing required fields");
  }

  const validationError = validateChallengeContent(type, parsed.content);
  if (validationError) {
    throw new Error(`AI-generated content failed validation: ${validationError}`);
  }

  return {
    title: String(parsed.title).slice(0, 120),
    description: String(parsed.description || "").slice(0, 500),
    content: parsed.content,
  };
}

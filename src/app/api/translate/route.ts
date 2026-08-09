import { NextRequest, NextResponse } from "next/server";

// Official LibreTranslate hosted instance — free tier works without an
// API key but is rate-limited. If translation volume grows, consider
// getting a free/paid API key at https://portal.libretranslate.com
// and setting LIBRETRANSLATE_API_KEY, or self-hosting your own instance
// and pointing LIBRETRANSLATE_URL at it.
const LIBRETRANSLATE_URL =
  process.env.LIBRETRANSLATE_URL || "https://libretranslate.com/translate";

export async function POST(req: NextRequest) {
  try {
    const { text, targetLang } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const target = (targetLang || "en").toLowerCase();

    const body: Record<string, string> = {
      q: text,
      source: "auto",
      target,
      format: "text",
    };

    if (process.env.LIBRETRANSLATE_API_KEY) {
      body.api_key = process.env.LIBRETRANSLATE_API_KEY;
    }

    const res = await fetch(LIBRETRANSLATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("LibreTranslate error:", res.status, errText);
      return NextResponse.json(
        { error: "Translation service unavailable" },
        { status: 502 }
      );
    }

    const data = await res.json();

    return NextResponse.json({
      translatedText: data.translatedText,
      detectedSourceLang: data.detectedLanguage?.language || null,
    });
  } catch (error) {
    console.error("Translate route error:", error);
    return NextResponse.json({ error: "Failed to translate" }, { status: 500 });
  }
}

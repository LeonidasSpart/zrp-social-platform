import { NextRequest, NextResponse } from "next/server";

// Public LibreTranslate instance — free, no API key required.
// Rate limits apply on shared public instances; if traffic grows,
// consider self-hosting LibreTranslate later and pointing this at
// your own URL via the LIBRETRANSLATE_URL env var.
const LIBRETRANSLATE_URL =
  process.env.LIBRETRANSLATE_URL || "https://translate.argosopentech.com/translate";

export async function POST(req: NextRequest) {
  try {
    const { text, targetLang } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const target = (targetLang || "en").toLowerCase();

    const res = await fetch(LIBRETRANSLATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        source: "auto",
        target,
        format: "text",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("LibreTranslate error:", errText);
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

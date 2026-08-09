import { NextRequest, NextResponse } from "next/server";

// MyMemory Translation API — free, no API key required.
// Rate limit: ~5,000 words/day per IP (10,000/day if MYMEMORY_EMAIL is set,
// per their fair-use policy for identifying good-faith usage).
const MYMEMORY_URL = "https://api.mymemory.translated.net/get";

export async function POST(req: NextRequest) {
  try {
    const { text, targetLang } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const target = (targetLang || "en").toLowerCase();

    // MyMemory wants a source|target language pair. We don't know the
    // source language ahead of time, so we ask it to auto-detect by
    // passing "autodetect" as the source.
    const langPair = `autodetect|${target}`;

    const params = new URLSearchParams({
      q: text,
      langpair: langPair,
    });

    if (process.env.MYMEMORY_EMAIL) {
      params.set("de", process.env.MYMEMORY_EMAIL);
    }

    const res = await fetch(`${MYMEMORY_URL}?${params.toString()}`, {
      method: "GET",
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("MyMemory error:", res.status, errText);
      return NextResponse.json(
        { error: "Translation service unavailable" },
        { status: 502 }
      );
    }

    const data = await res.json();

    if (!data?.responseData?.translatedText) {
      console.error("MyMemory unexpected response:", JSON.stringify(data));
      return NextResponse.json(
        { error: "Translation service unavailable" },
        { status: 502 }
      );
    }

    // MyMemory sometimes echoes back an error message inside a 200 response
    // (e.g. quota exceeded) instead of returning a proper HTTP error code.
    if (data.responseStatus && data.responseStatus !== 200) {
      console.error("MyMemory responseStatus error:", data.responseStatus, data.responseDetails);
      return NextResponse.json(
        { error: "Translation service unavailable" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      translatedText: data.responseData.translatedText,
      detectedSourceLang: data.responseData.match ? null : null, // MyMemory doesn't return detected source lang directly
    });
  } catch (error) {
    console.error("Translate route error:", error);
    return NextResponse.json({ error: "Failed to translate" }, { status: 500 });
  }
}

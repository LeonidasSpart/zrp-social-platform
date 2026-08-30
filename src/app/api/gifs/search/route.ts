import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // Using Giphy API (free tier)
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) {
    console.error("GIPHY_API_KEY not set: GIF picker cannot search GIFs");
    return NextResponse.json({ error: "GIF search is not configured" }, { status: 503 });
  }

  try {
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=20&rating=g`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !Array.isArray(data?.data)) {
      console.error("GIF search error: Giphy returned", response.status, data?.meta?.msg || data);
      return NextResponse.json({ error: "Failed to search GIFs" }, { status: 502 });
    }

    const results = data.data.map((gif: any) => ({
      id: gif.id,
      url: gif.images.fixed_width.url,
      title: gif.title,
      width: gif.images.fixed_width.width,
      height: gif.images.fixed_width.height,
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("GIF search error:", error);
    return NextResponse.json({ error: "Failed to search GIFs" }, { status: 500 });
  }
}

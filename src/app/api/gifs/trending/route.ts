import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) {
    console.error("GIPHY_API_KEY not set: GIF picker cannot load trending GIFs");
    return NextResponse.json({ error: "GIF search is not configured" }, { status: 503 });
  }

  try {
    const url = `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=20&rating=g`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !Array.isArray(data?.data)) {
      console.error("Trending GIFs error: Giphy returned", response.status, data?.meta?.msg || data);
      return NextResponse.json({ error: "Failed to fetch trending GIFs" }, { status: 502 });
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
    console.error("Trending GIFs error:", error);
    return NextResponse.json({ error: "Failed to fetch trending GIFs" }, { status: 500 });
  }
}

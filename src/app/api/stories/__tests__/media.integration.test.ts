import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { POST } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(body: unknown) {
  return new NextRequest("https://zrp.one/api/stories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Security regression coverage: POST /api/stories stored whatever
// mediaUrl the client sent. Every client uploads through the storyMedia
// UploadThing route, so only that storage is accepted now.
describe.skipIf(!hasRealDatabaseUrl)("POST /api/stories media trust (integration, real Postgres)", () => {
  const userIds: string[] = [];

  async function createUser() {
    const user = await prisma.user.create({
      data: {
        email: `story-${randomUUID().slice(0, 8)}@mediatest.example`,
        username: `st${randomUUID().slice(0, 8)}`,
        password: "$2a$10$storytestplaceholderhash000000000000000000000000000",
        role: "USER",
      },
    });
    userIds.push(user.id);
    getServerSession.mockResolvedValue({ user: { id: user.id } });
    return user;
  }

  afterAll(async () => {
    await prisma.story.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("accepts legitimate UploadThing media (legacy utfs.io and current ufs.sh forms)", async () => {
    await createUser();
    for (const mediaUrl of ["https://utfs.io/f/abc123story.jpg", "https://zrp1abc.ufs.sh/f/abc123story.mp4"]) {
      const res = await POST(req({ mediaUrl, mediaType: mediaUrl.endsWith(".mp4") ? "video" : "image" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mediaUrl).toBe(mediaUrl);
    }
  });

  it("text-only stories keep working", async () => {
    await createUser();
    const res = await POST(req({ content: "hello" }));
    expect(res.status).toBe(200);
  });

  it("rejects every untrusted media source", async () => {
    await createUser();
    const rejected = [
      "https://evil.example/pixel.gif",
      "http://utfs.io/f/downgraded.jpg",
      "https://localhost/f/x.jpg",
      "https://127.0.0.1/f/x.jpg",
      "https://10.0.0.5/f/x.jpg",
      "https://192.168.1.1/f/x.jpg",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/f/x.jpg",
      "file:///etc/passwd",
      "data:image/png;base64,AAAA",
      "javascript:alert(1)",
      "https://utfs.io.evil.example/f/x.jpg",
      "https://utfs.io@evil.example/f/x.jpg",
      "https://evil.example\\@utfs.io/f/x.jpg",
      "https://evil.example/f/x.jpg?next=https://utfs.io/f/y.jpg",
      "//utfs.io/f/x.jpg",
      "utfs.io/f/x.jpg",
      "not a url at all",
    ];
    for (const mediaUrl of rejected) {
      const res = await POST(req({ mediaUrl, mediaType: "image" }));
      expect(res.status, mediaUrl).toBe(400);
    }
    // Nothing was stored.
    const stored = await prisma.story.count({ where: { userId: { in: userIds }, mediaUrl: { not: null } } });
    expect(stored).toBe(2);
  });

  it("an arbitrary URL cannot be labelled a video either", async () => {
    await createUser();
    const res = await POST(req({ mediaUrl: "https://attacker.example/video.mp4", mediaType: "video" }));
    expect(res.status).toBe(400);
  });
});

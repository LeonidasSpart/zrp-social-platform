import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken }));

import { POST } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function postReq(body: Record<string, unknown>) {
  return new NextRequest("https://zrp.one/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Regression coverage for F3 (ios-native/PARITY.md): POST /api/posts
// stored a poll's expiresAt with a bare `new Date(poll.expiresAt)`,
// unlike the post's own scheduledAt (routed through resolveScheduledAt
// for F2). A naive "yyyy-MM-ddTHH:mm" string with no offset info is read
// as the SERVER's local time, so an author's poll set to close at 23:00
// in their own timezone actually closed at 23:00 UTC - hours early or
// late depending on the author's real offset.
describe.skipIf(!hasRealDatabaseUrl)(
  "POST /api/posts - poll expiresAt timezone (integration, real Postgres)",
  () => {
    const userIds: string[] = [];
    const postIds: string[] = [];
    const pollIds: string[] = [];

    afterAll(async () => {
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.poll.deleteMany({ where: { id: { in: pollIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser() {
      const user = await prisma.user.create({
        data: {
          email: `pollexpiry-${randomUUID().slice(0, 8)}@posttest.example`,
          username: `pollexpiry${randomUUID().slice(0, 6)}`,
          password: "x",
          role: "USER",
          plan: "free",
        },
      });
      userIds.push(user.id);
      return user;
    }

    // A fixed calendar date one year out - always in the future relative
    // to whenever this suite runs (the N8 "expiry must be in the future"
    // check added below would otherwise reject a hardcoded past date as
    // time passes), while staying deterministic enough for the exact
    // ISO-string assertions these tests make.
    const futureYear = new Date().getUTCFullYear() + 1;

    it("resolves the poll's naive expiresAt using the supplied offset, same as scheduledAt", async () => {
      const user = await createUser();
      getToken.mockResolvedValue({ id: user.id });

      // Author in UTC+9 (offset -540, matching getTimezoneOffset's sign
      // convention) sets their poll to close at 23:00 local wall-clock
      // time. Read naively that would be 23:00 UTC - 14 hours later than
      // the real intended instant of 14:00 UTC the same day.
      const res = await POST(
        postReq({
          content: "poll expiry timezone test",
          poll: {
            question: "Q?",
            options: ["A", "B"],
            expiresAt: `${futureYear}-06-15T23:00`,
            expiresAtOffsetMinutes: -540,
          },
        })
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      postIds.push(body.post.id);
      pollIds.push(body.post.pollId);

      const poll = await prisma.poll.findUnique({ where: { id: body.post.pollId } });
      expect(poll?.expiresAt?.toISOString()).toBe(`${futureYear}-06-15T14:00:00.000Z`);
    });

    it("still parses an already-unambiguous ISO instant directly (iOS path), ignoring any offset field", async () => {
      const user = await createUser();
      getToken.mockResolvedValue({ id: user.id });

      const res = await POST(
        postReq({
          content: "poll expiry instant test",
          poll: {
            question: "Q?",
            options: ["A", "B"],
            expiresAt: `${futureYear}-06-15T14:00:00.000Z`,
          },
        })
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      postIds.push(body.post.id);
      pollIds.push(body.post.pollId);

      const poll = await prisma.poll.findUnique({ where: { id: body.post.pollId } });
      expect(poll?.expiresAt?.toISOString()).toBe(`${futureYear}-06-15T14:00:00.000Z`);
    });

    /*
     * ⚠️ SECURITY regression coverage (N8): poll creation used to accept
     * any number of options of any length, an empty/oversized question,
     * duplicate options, and an already-past or garbage expiresAt - only
     * "more than one option" was checked. Bounds now match this repo's
     * own existing client-side limits (PostComposer.tsx's
     * pollMaxOptions/pollQuestionMaxLength/pollOptionMaxLength: 6
     * options, 200-char question, 60-char option).
     */
    it("[N8] rejects a poll with more than the maximum allowed options", async () => {
      const user = await createUser();
      getToken.mockResolvedValue({ id: user.id });

      const res = await POST(
        postReq({
          content: "too many options",
          poll: { question: "Q?", options: ["A", "B", "C", "D", "E", "F", "G"] },
        })
      );

      expect(res.status).toBe(400);
    });

    it("[N8] rejects a poll question over the character limit", async () => {
      const user = await createUser();
      getToken.mockResolvedValue({ id: user.id });

      const res = await POST(
        postReq({
          content: "question too long",
          poll: { question: "Q".repeat(201), options: ["A", "B"] },
        })
      );

      expect(res.status).toBe(400);
    });

    it("[N8] rejects a poll option over the character limit", async () => {
      const user = await createUser();
      getToken.mockResolvedValue({ id: user.id });

      const res = await POST(
        postReq({
          content: "option too long",
          poll: { question: "Q?", options: ["A".repeat(61), "B"] },
        })
      );

      expect(res.status).toBe(400);
    });

    it("[N8] rejects a poll with an empty/whitespace-only option", async () => {
      const user = await createUser();
      getToken.mockResolvedValue({ id: user.id });

      const res = await POST(
        postReq({
          content: "empty option",
          poll: { question: "Q?", options: ["A", "   "] },
        })
      );

      expect(res.status).toBe(400);
    });

    it("[N8] rejects a poll with duplicate options", async () => {
      const user = await createUser();
      getToken.mockResolvedValue({ id: user.id });

      const res = await POST(
        postReq({
          content: "duplicate options",
          poll: { question: "Q?", options: ["Same", "Same"] },
        })
      );

      expect(res.status).toBe(400);
    });

    it("[N8] rejects a poll expiresAt already in the past", async () => {
      const user = await createUser();
      getToken.mockResolvedValue({ id: user.id });

      const res = await POST(
        postReq({
          content: "already expired poll",
          poll: { question: "Q?", options: ["A", "B"], expiresAt: "2020-01-01T00:00:00.000Z" },
        })
      );

      expect(res.status).toBe(400);
    });

    it("[N8] rejects a poll with a garbage expiresAt value", async () => {
      const user = await createUser();
      getToken.mockResolvedValue({ id: user.id });

      const res = await POST(
        postReq({
          content: "garbage expiry poll",
          poll: { question: "Q?", options: ["A", "B"], expiresAt: "not-a-real-date" },
        })
      );

      expect(res.status).toBe(400);
    });

    it("[N8] accepts a poll at exactly the maximum option count/lengths", async () => {
      const user = await createUser();
      getToken.mockResolvedValue({ id: user.id });

      const res = await POST(
        postReq({
          content: "boundary poll",
          poll: {
            question: "Q".repeat(200),
            options: ["A".repeat(60), "B", "C", "D", "E", "F"],
          },
        })
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      postIds.push(body.post.id);
      pollIds.push(body.post.pollId);
    });
  }
);

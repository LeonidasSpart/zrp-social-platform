import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { auditOAuthDuplicates } from "../oauth-duplicate-audit";

// Validates the read-only duplicate audit against synthetic groups that
// reproduce the exact shapes the production bug produced, so the report
// it prints against production can be trusted: detection, canonical
// choice, origin attribution, verdicts, and the per-category inventory.

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

describe.skipIf(!hasRealDatabaseUrl)("auditOAuthDuplicates (integration, real Postgres)", () => {
  const runId = randomUUID().slice(0, 8);
  const created: string[] = [];
  let originalId = "";
  let oauthShellId = "";
  let secondRegistrationId = "";
  let busyDuplicateId = "";

  async function user(data: {
    email: string;
    username: string;
    password: string | null;
    createdAt: Date;
    emailVerified?: Date | null;
    onboardingCompleted?: boolean;
  }) {
    const row = await prisma.user.create({
      data: {
        email: data.email,
        username: data.username,
        password: data.password,
        role: "USER",
        emailVerified: data.emailVerified === undefined ? new Date() : data.emailVerified,
        onboardingCompleted: data.onboardingCompleted ?? true,
        createdAt: data.createdAt,
      },
    });
    created.push(row.id);
    return row;
  }

  beforeAll(async () => {
    const hash = await bcrypt.hash("pw", 4);
    // Group A: the OAuth bug's signature - mixed-case original with a
    // password, then an empty lowercase shell with no password.
    const original = await user({
      email: `Alice.Dup-${runId}@Example.com`,
      username: `aliceA${runId}`.slice(0, 20),
      password: hash,
      createdAt: new Date("2025-01-01T00:00:00Z"),
    });
    originalId = original.id;
    await prisma.post.create({ data: { content: "hello", authorId: original.id } });
    const shell = await user({
      email: `alice.dup-${runId}@example.com`,
      username: `aliceB${runId}`.slice(0, 20),
      password: null,
      createdAt: new Date("2025-06-01T00:00:00Z"),
      onboardingCompleted: false,
    });
    oauthShellId = shell.id;

    // Group B: two registrations that both carry a password (the
    // pre-normalization register path), and the newer one owns a post -
    // must be flagged for manual review, never "safe".
    const first = await user({
      email: `Bob.Dup-${runId}@Example.com`,
      username: `bobA${runId}`.slice(0, 20),
      password: hash,
      createdAt: new Date("2025-02-01T00:00:00Z"),
    });
    const second = await user({
      email: `bob.dup-${runId}@example.com`,
      username: `bobB${runId}`.slice(0, 20),
      password: hash,
      createdAt: new Date("2025-07-01T00:00:00Z"),
    });
    secondRegistrationId = second.id;
    busyDuplicateId = second.id;
    await prisma.post.create({ data: { content: "later", authorId: second.id } });
    await prisma.follow.create({ data: { followerId: second.id, followingId: first.id } });

    // A lone mixed-case account is NOT a duplicate.
    await user({
      email: `Carol.Solo-${runId}@Example.com`,
      username: `carol${runId}`.slice(0, 20),
      password: hash,
      createdAt: new Date("2025-03-01T00:00:00Z"),
    });
  });

  afterAll(async () => {
    await prisma.post.deleteMany({ where: { authorId: { in: created } } });
    await prisma.follow.deleteMany({
      where: { OR: [{ followerId: { in: created } }, { followingId: { in: created } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: created } } });
  });

  it("detects exactly the case-variant groups from this run, oldest row canonical", async () => {
    const report = await auditOAuthDuplicates();
    const mine = report.groups.filter((g) => g.members.some((m) => created.includes(m.id)));
    expect(mine).toHaveLength(2);

    const groupA = mine.find((g) => g.canonicalId === originalId)!;
    expect(groupA).toBeDefined();
    expect(groupA.memberCount).toBe(2);
    expect(groupA.duplicateIds).toEqual([oauthShellId]);
    expect(groupA.canonicalHasPassword).toBe(true);
    expect(groupA.canonicalHasData).toBe(true);
    expect(groupA.origin).toBe("oauth-link-miss");
    expect(groupA.verdict).toBe("safe-to-merge");
    expect(groupA.duplicatesEmpty).toBe(1);
    expect(groupA.duplicatesWithData).toBe(0);
    expect(groupA.dataOnlyOnDuplicates).toEqual([]);

    const groupB = mine.find((g) => g.duplicateIds.includes(secondRegistrationId))!;
    expect(groupB).toBeDefined();
    expect(groupB.origin).toBe("pre-normalization-register");
    expect(groupB.verdict).toBe("manual-review");
    expect(groupB.duplicatesWithData).toBe(1);
    expect(groupB.reviewReasons.join(" ")).toMatch(/own records/);
    const busy = groupB.members.find((m) => m.id === busyDuplicateId)!;
    expect(busy.data.content).toBe(1);
    expect(busy.data.socialGraph).toBe(1);
    // The follow points at the canonical account, so the social graph is
    // present on BOTH sides; only the post exists solely on the duplicate.
    expect(groupB.dataOnlyOnDuplicates).toEqual(["content"]);
  });

  it("never surfaces an email, name, password hash or token", async () => {
    const report = await auditOAuthDuplicates();
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/@example\.com/i);
    expect(serialized).not.toMatch(/\$2[aby]\$/);
    expect(serialized).not.toMatch(/"email"\s*:/);
    expect(serialized).not.toMatch(/"password"\s*:/);
    expect(serialized).not.toMatch(/"name"\s*:/);
  });

  it("performs no writes: every row is byte-for-byte unchanged after the audit", async () => {
    const before = await prisma.user.findMany({
      where: { id: { in: created } },
      orderBy: { id: "asc" },
    });
    await auditOAuthDuplicates();
    const after = await prisma.user.findMany({
      where: { id: { in: created } },
      orderBy: { id: "asc" },
    });
    expect(after).toEqual(before);
  });
});

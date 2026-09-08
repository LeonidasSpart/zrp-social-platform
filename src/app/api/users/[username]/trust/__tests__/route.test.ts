import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function call(username: string) {
  return GET(new Request(`https://zrp.one/api/users/${username}/trust`), {
    params: Promise.resolve({ username }),
  });
}

// Regression coverage for L5 (ios-native/PARITY.md): GET
// /api/users/{username}/trust used to build its `breakdown`, `signals` and
// `additionalSignals` entirely out of hardcoded English `title`/
// `description` strings (and a hardcoded English `levelLabel`) with no
// dictionary entry anywhere for a non-web client to translate against -
// iOS and Android could only render the route's English text as-is.
//
// Every one of those items now carries a stable titleKey/descriptionKey
// (plus descriptionParams where the text is parameterized) that matches a
// real key in src/lib/translations.ts, so any client can localize instead
// of guessing. The old prose fields are left untouched for backward
// compatibility - this only asserts the new key fields are present and
// correct alongside them.
describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/users/[username]/trust (integration, real Postgres)",
  () => {
    const userIds: string[] = [];

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("sends stable titleKey/descriptionKey alongside the existing English prose", async () => {
      const username = `trust${randomUUID().slice(0, 8)}`;
      const user = await prisma.user.create({
        data: {
          email: `${username}@trusttest.example`,
          username,
          password: "x",
          role: "USER",
          emailVerified: new Date(),
        },
      });
      userIds.push(user.id);

      const res = await call(username);
      expect(res.status).toBe(200);
      const body = await res.json();

      // Trust level label.
      expect(body.passport.levelLabelKey).toBe("trust.levelLow");
      expect(typeof body.passport.levelLabel).toBe("string");

      // Breakdown category keys.
      const security = body.passport.breakdown.find((c: { key: string }) => c.key === "security");
      expect(security.titleKey).toBe("trust.categorySecurity");
      expect(security.descriptionKey).toBe("trust.categorySecurityDesc");
      const emailSignal = security.signals.find((s: { key: string }) => s.key === "emailVerified");
      expect(emailSignal.titleKey).toBe("trust.signalEmailTitle");

      // Top-level signals: static keys plus the category cross-reference.
      const email = body.signals.find((s: { key: string }) => s.key === "email");
      expect(email.titleKey).toBe("trust.signalEmailTitle");
      expect(email.descriptionKey).toBe("trust.signalEmailDesc");
      expect(email.categoryTitleKey).toBe("trust.categorySecurity");

      // account-age is parameterized and conditional on account age -
      // a brand-new account should get the "history" variant with params.
      const accountAge = body.signals.find((s: { key: string }) => s.key === "account-age");
      expect(accountAge.titleKey).toBe("trust.signalAccountAgeTitleHistory");
      expect(accountAge.descriptionKey).toBe("trust.signalAccountAgeDescHistoryPlural");
      expect(accountAge.descriptionParams).toEqual({ months: 0 });

      // additionalSignals (wallet).
      const wallet = body.additionalSignals.find((s: { key: string }) => s.key === "walletVerified");
      expect(wallet.titleKey).toBe("trust.signalWalletVerifiedTitle");
      expect(wallet.descriptionKey).toBe("trust.signalWalletVerifiedDesc");
    });

    it("switches the account-age key to the established variant (no params) at 12+ months", async () => {
      const username = `trustold${randomUUID().slice(0, 6)}`;
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const user = await prisma.user.create({
        data: {
          email: `${username}@trusttest.example`,
          username,
          password: "x",
          role: "USER",
          createdAt: twoYearsAgo,
        },
      });
      userIds.push(user.id);

      const res = await call(username);
      const body = await res.json();
      const accountAge = body.signals.find((s: { key: string }) => s.key === "account-age");
      expect(accountAge.titleKey).toBe("trust.signalAccountAgeTitleEstablished");
      expect(accountAge.descriptionKey).toBe("trust.signalAccountAgeDescEstablished");
      expect(accountAge.descriptionParams).toBeUndefined();
    });
  }
);

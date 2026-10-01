import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { computeProposalStatus, type DaoProposalTallyLike } from "../dao-service";

function proposal(overrides: Partial<DaoProposalTallyLike> = {}): DaoProposalTallyLike {
  return {
    votingEndsAt: new Date("2026-01-10T00:00:00Z"),
    forRaw: new Prisma.Decimal("0"),
    againstRaw: new Prisma.Decimal("0"),
    abstainRaw: new Prisma.Decimal("0"),
    cancelledAt: null,
    ...overrides,
  };
}

const quorum = new Prisma.Decimal("100");

describe("computeProposalStatus", () => {
  it("is ACTIVE before votingEndsAt, regardless of tallies", () => {
    const status = computeProposalStatus(proposal({ forRaw: new Prisma.Decimal("1000") }), quorum, new Date("2026-01-05T00:00:00Z"));
    expect(status).toBe("ACTIVE");
  });

  it("is CANCELLED whenever cancelledAt is set, even before votingEndsAt", () => {
    const status = computeProposalStatus(
      proposal({ cancelledAt: new Date("2026-01-03T00:00:00Z") }),
      quorum,
      new Date("2026-01-05T00:00:00Z")
    );
    expect(status).toBe("CANCELLED");
  });

  it("is REJECTED after voting ends if total votes cast fall short of quorum, even with a FOR majority", () => {
    const status = computeProposalStatus(
      proposal({ forRaw: new Prisma.Decimal("50"), againstRaw: new Prisma.Decimal("0") }),
      quorum,
      new Date("2026-01-11T00:00:00Z")
    );
    expect(status).toBe("REJECTED");
  });

  it("is PASSED after voting ends when quorum is met and FOR exceeds AGAINST", () => {
    const status = computeProposalStatus(
      proposal({ forRaw: new Prisma.Decimal("80"), againstRaw: new Prisma.Decimal("30") }),
      quorum,
      new Date("2026-01-11T00:00:00Z")
    );
    expect(status).toBe("PASSED");
  });

  it("is REJECTED after voting ends when quorum is met but AGAINST exceeds FOR", () => {
    const status = computeProposalStatus(
      proposal({ forRaw: new Prisma.Decimal("30"), againstRaw: new Prisma.Decimal("80") }),
      quorum,
      new Date("2026-01-11T00:00:00Z")
    );
    expect(status).toBe("REJECTED");
  });

  it("is REJECTED on an exact FOR/AGAINST tie (ties do not pass)", () => {
    const status = computeProposalStatus(
      proposal({ forRaw: new Prisma.Decimal("60"), againstRaw: new Prisma.Decimal("60") }),
      quorum,
      new Date("2026-01-11T00:00:00Z")
    );
    expect(status).toBe("REJECTED");
  });

  it("counts ABSTAIN toward quorum but never toward the FOR/AGAINST outcome", () => {
    // 40 FOR + 0 AGAINST + 61 ABSTAIN = 101 total, clears the 100 quorum;
    // FOR (40) still beats AGAINST (0) regardless of the abstain weight.
    const status = computeProposalStatus(
      proposal({ forRaw: new Prisma.Decimal("40"), againstRaw: new Prisma.Decimal("0"), abstainRaw: new Prisma.Decimal("61") }),
      quorum,
      new Date("2026-01-11T00:00:00Z")
    );
    expect(status).toBe("PASSED");
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const startHourlyNewsCycles = vi.hoisted(() => vi.fn(() => () => {}));
vi.mock("@/lib/news/hourly-runner", () => ({ startHourlyNewsCycles }));

const startWithdrawalReconciliation = vi.hoisted(() => vi.fn(() => () => {}));
vi.mock("@/lib/withdrawals-reconcile-runner", () => ({ startWithdrawalReconciliation }));

import { register } from "@/instrumentation";

/*
 * When the app starts its own news cycles. Getting this wrong is
 * expensive in both directions: off in production and no category ever
 * refreshes, on during local development and every `npm run dev`
 * quietly fetches live feeds and spends model calls.
 */
describe("starting the news scheduler at boot", () => {
  // vi.stubEnv, not direct assignment: every suite shares one process,
  // so a write to process.env here outlives this file and would reach
  // whatever runs next. stubEnv is scoped and unwound in afterEach.
  beforeEach(() => {
    startHourlyNewsCycles.mockClear();
    startWithdrawalReconciliation.mockClear();
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEWS_SCHEDULER", "");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("WITHDRAWAL_RECONCILER", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("starts in production, so nothing has to trigger it", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await register();
    expect(startHourlyNewsCycles).toHaveBeenCalledTimes(1);
  });

  it("does nothing on a developer machine", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await register();
    expect(startHourlyNewsCycles).not.toHaveBeenCalled();
  });

  it("can be switched off in production without a code change", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEWS_SCHEDULER", "off");

    await register();
    expect(startHourlyNewsCycles).not.toHaveBeenCalled();
  });

  it("can be switched on deliberately outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEWS_SCHEDULER", "on");

    await register();
    expect(startHourlyNewsCycles).toHaveBeenCalledTimes(1);
  });

  it("does not start during a production build", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    await register();
    expect(startHourlyNewsCycles).not.toHaveBeenCalled();
  });

  it("stays out of the edge runtime, which has neither Prisma nor lasting timers", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "edge");

    await register();
    expect(startHourlyNewsCycles).not.toHaveBeenCalled();
  });
});

/*
 * The withdrawal reconciliation runner: unlike the news scheduler, this
 * touches real financial state, so it defaults to ON everywhere
 * (including local dev - a stuck withdrawal is not something to leave
 * unreconciled just because someone is running `npm run dev`) with an
 * explicit off-switch for the one case that needs it: a read-only
 * replica that must not write to WithdrawalRequest/CreatorProfile.
 */
describe("starting withdrawal reconciliation at boot", () => {
  beforeEach(() => {
    startHourlyNewsCycles.mockClear();
    startWithdrawalReconciliation.mockClear();
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("WITHDRAWAL_RECONCILER", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("starts by default in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await register();
    expect(startWithdrawalReconciliation).toHaveBeenCalledTimes(1);
  });

  it("starts by default in development too - financial state is never left unreconciled by default", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await register();
    expect(startWithdrawalReconciliation).toHaveBeenCalledTimes(1);
  });

  it("can be switched off explicitly, e.g. for a read-only replica", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WITHDRAWAL_RECONCILER", "off");

    await register();
    expect(startWithdrawalReconciliation).not.toHaveBeenCalled();
  });

  it("does not start during a production build", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    await register();
    expect(startWithdrawalReconciliation).not.toHaveBeenCalled();
  });

  it("stays out of the edge runtime", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "edge");

    await register();
    expect(startWithdrawalReconciliation).not.toHaveBeenCalled();
  });
});

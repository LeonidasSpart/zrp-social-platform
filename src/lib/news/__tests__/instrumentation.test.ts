import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const startHourlyNewsCycles = vi.hoisted(() => vi.fn(() => () => {}));
vi.mock("@/lib/news/hourly-runner", () => ({ startHourlyNewsCycles }));

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
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEWS_SCHEDULER", "");
    vi.stubEnv("NEXT_PHASE", "");
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

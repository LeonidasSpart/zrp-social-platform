import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { runPipelineCycle } = vi.hoisted(() => ({ runPipelineCycle: vi.fn() }));
vi.mock("@/lib/news/pipeline", () => ({ runPipelineCycle }));

import { GET } from "../route";

function call(authorization?: string) {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return GET(new NextRequest("https://zrp.one/api/cron/news-pipeline", { headers }));
}

describe("GET /api/cron/news-pipeline authorization", () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.CRON_SECRET;
    runPipelineCycle.mockReset();
    runPipelineCycle.mockResolvedValue({ ran: true, published: 0, scheduled: 0 });
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("fails closed when CRON_SECRET is not configured", async () => {
    // The bug this guards against: a `if (secret && ...)` check turns a
    // missing env var into a fully public publishing endpoint.
    delete process.env.CRON_SECRET;
    const response = await call("Bearer anything");
    expect(response.status).toBe(401);
    expect(runPipelineCycle).not.toHaveBeenCalled();
  });

  it("rejects a request with no Authorization header", async () => {
    process.env.CRON_SECRET = "test-secret";
    expect((await call()).status).toBe(401);
    expect(runPipelineCycle).not.toHaveBeenCalled();
  });

  it("rejects the wrong secret", async () => {
    process.env.CRON_SECRET = "test-secret";
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(runPipelineCycle).not.toHaveBeenCalled();
  });

  it("runs one cycle for the right secret", async () => {
    process.env.CRON_SECRET = "test-secret";
    const response = await call("Bearer test-secret");
    expect(response.status).toBe(200);
    expect(runPipelineCycle).toHaveBeenCalledTimes(1);
    expect(runPipelineCycle).toHaveBeenCalledWith({ trigger: "cron" });
  });

  it("reports a cycle failure as a 500 rather than leaking the error", async () => {
    process.env.CRON_SECRET = "test-secret";
    runPipelineCycle.mockRejectedValue(new Error("database exploded"));
    const response = await call("Bearer test-secret");
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("database exploded");
  });
});

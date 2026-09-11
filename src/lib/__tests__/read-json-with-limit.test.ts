import { describe, it, expect } from "vitest";
import { readJsonWithLimit, BodyTooLargeError } from "../read-json-with-limit";

function requestWithBody(body: string, opts?: { contentLength?: string | null }) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts?.contentLength !== undefined && opts.contentLength !== null) {
    headers["content-length"] = opts.contentLength;
  }
  return new Request("https://zrp.one/api/ai/chat", {
    method: "POST",
    headers,
    body,
  });
}

// Simulates a chunked-transfer request: no Content-Length header at all,
// which is exactly the case a Content-Length-based size check misses -
// see the ⚠️ SECURITY comment in read-json-with-limit.ts.
function chunkedRequest(body: string) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const bytes = new TextEncoder().encode(body);
      // Split into several small chunks to exercise multi-chunk reads.
      const chunkSize = 8;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        controller.enqueue(bytes.slice(i, i + chunkSize));
      }
      controller.close();
    },
  });
  // undici's Request accepts a ReadableStream body with `duplex: "half"`
  // at runtime, but the DOM RequestInit type doesn't declare `duplex` -
  // cast rather than fight the type for a test-only request shape.
  return new Request("https://zrp.one/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit);
}

describe("readJsonWithLimit", () => {
  it("parses a normal JSON body under the limit", async () => {
    const req = requestWithBody(JSON.stringify({ message: "hello" }));
    const parsed = await readJsonWithLimit(req, 1024);
    expect(parsed).toEqual({ message: "hello" });
  });

  it("rejects a body whose actual bytes exceed the limit, even with no Content-Length header", async () => {
    const huge = JSON.stringify({ message: "x".repeat(10_000) });
    const req = chunkedRequest(huge);
    await expect(readJsonWithLimit(req, 1024)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("rejects a body whose actual bytes exceed the limit even when Content-Length lies and claims it's small", async () => {
    const huge = JSON.stringify({ message: "x".repeat(10_000) });
    // A malicious/broken client claiming a tiny Content-Length while
    // actually streaming a huge body - the old check trusted this header
    // and would have let it straight through to req.json().
    const req = requestWithBody(huge, { contentLength: "10" });
    await expect(readJsonWithLimit(req, 1024)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("stops reading and cancels the stream as soon as the limit is exceeded, not after buffering everything", async () => {
    const huge = JSON.stringify({ message: "x".repeat(1_000_000) });
    const req = chunkedRequest(huge);
    const start = Date.now();
    await expect(readJsonWithLimit(req, 100)).rejects.toBeInstanceOf(BodyTooLargeError);
    // Not a strict perf assertion, just confirms it didn't need to read
    // the full 1MB body before rejecting.
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it("returns undefined for an empty body", async () => {
    const req = requestWithBody("");
    const parsed = await readJsonWithLimit(req, 1024);
    expect(parsed).toBeUndefined();
  });

  it("propagates a JSON.parse error for malformed JSON", async () => {
    const req = requestWithBody("{not json");
    await expect(readJsonWithLimit(req, 1024)).rejects.toThrow();
  });
});

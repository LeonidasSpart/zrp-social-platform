import { describe, it, expect, afterEach } from "vitest";
import zlib from "zlib";
import http from "http";
import type { AddressInfo } from "net";
import {
  isDisallowedIPv4,
  isDisallowedIPv6,
  decompressBody,
  validateUrl,
  safeFetch,
  SsrfBlockedError,
} from "../ssrf-guard";

describe("isDisallowedIPv4", () => {
  it("blocks loopback", () => {
    expect(isDisallowedIPv4("127.0.0.1")).toBe(true);
  });

  it("blocks private RFC1918 ranges", () => {
    expect(isDisallowedIPv4("10.0.0.1")).toBe(true);
    expect(isDisallowedIPv4("172.16.0.1")).toBe(true);
    expect(isDisallowedIPv4("172.31.255.255")).toBe(true);
    expect(isDisallowedIPv4("192.168.1.1")).toBe(true);
  });

  it("blocks link-local / cloud metadata (169.254.169.254)", () => {
    expect(isDisallowedIPv4("169.254.169.254")).toBe(true);
    expect(isDisallowedIPv4("169.254.0.1")).toBe(true);
  });

  it("blocks 0.0.0.0/8 and CGNAT", () => {
    expect(isDisallowedIPv4("0.0.0.0")).toBe(true);
    expect(isDisallowedIPv4("100.64.0.1")).toBe(true);
  });

  it("blocks multicast/reserved/broadcast (224+)", () => {
    expect(isDisallowedIPv4("224.0.0.1")).toBe(true);
    expect(isDisallowedIPv4("255.255.255.255")).toBe(true);
  });

  it("allows ordinary public IPs", () => {
    expect(isDisallowedIPv4("8.8.8.8")).toBe(false);
    expect(isDisallowedIPv4("1.1.1.1")).toBe(false);
    expect(isDisallowedIPv4("93.184.216.34")).toBe(false);
  });

  it("treats a malformed address as disallowed (fail closed)", () => {
    expect(isDisallowedIPv4("not-an-ip")).toBe(true);
    expect(isDisallowedIPv4("1.2.3")).toBe(true);
  });
});

describe("isDisallowedIPv6", () => {
  it("blocks loopback and unspecified", () => {
    expect(isDisallowedIPv6("::1")).toBe(true);
    expect(isDisallowedIPv6("::")).toBe(true);
  });

  it("blocks link-local (fe80::/10) and unique-local (fc00::/7)", () => {
    expect(isDisallowedIPv6("fe80::1")).toBe(true);
    expect(isDisallowedIPv6("fc00::1")).toBe(true);
    expect(isDisallowedIPv6("fd12:3456::1")).toBe(true);
  });

  it("blocks IPv4-mapped addresses whose embedded IPv4 is disallowed", () => {
    expect(isDisallowedIPv6("::ffff:169.254.169.254")).toBe(true);
    expect(isDisallowedIPv6("::ffff:127.0.0.1")).toBe(true);
  });

  it("allows IPv4-mapped addresses whose embedded IPv4 is public", () => {
    expect(isDisallowedIPv6("::ffff:8.8.8.8")).toBe(false);
  });

  it("allows an ordinary public IPv6 address", () => {
    expect(isDisallowedIPv6("2001:4860:4860::8888")).toBe(false);
  });
});

// Node's raw http/https client never auto-decompresses (unlike a
// browser or fetch()) - a response compressed by a CDN/host that
// defaults to gzip, served with or without the client asking for it,
// would otherwise be treated as UTF-8 text and silently fail every
// meta-tag regex, indistinguishable from "the page has no metadata."
describe("decompressBody", () => {
  const html = "<html><head><meta property=\"og:title\" content=\"Hello\"></head></html>";
  const original = Buffer.from(html, "utf-8");

  it("reverses gzip", () => {
    const compressed = zlib.gzipSync(original);
    expect(decompressBody(compressed, "gzip").toString("utf-8")).toBe(html);
  });

  it("reverses gzip for the non-standard x-gzip label some servers send", () => {
    const compressed = zlib.gzipSync(original);
    expect(decompressBody(compressed, "x-gzip").toString("utf-8")).toBe(html);
  });

  it("reverses deflate", () => {
    const compressed = zlib.deflateSync(original);
    expect(decompressBody(compressed, "deflate").toString("utf-8")).toBe(html);
  });

  it("reverses brotli", () => {
    const compressed = zlib.brotliCompressSync(original);
    expect(decompressBody(compressed, "br").toString("utf-8")).toBe(html);
  });

  it("passes the body through unchanged when there is no content-encoding", () => {
    expect(decompressBody(original, undefined).toString("utf-8")).toBe(html);
    expect(decompressBody(original, "").toString("utf-8")).toBe(html);
    expect(decompressBody(original, "identity").toString("utf-8")).toBe(html);
  });

  it("falls back to the raw bytes (never throws) on a truncated/corrupt gzip stream", () => {
    const compressed = zlib.gzipSync(original);
    const truncated = compressed.subarray(0, compressed.length - 5);
    expect(() => decompressBody(truncated, "gzip")).not.toThrow();
    // Can't recover the original from a truncated stream - just must not crash.
    expect(Buffer.isBuffer(decompressBody(truncated, "gzip"))).toBe(true);
  });
});

describe("validateUrl", () => {
  it("rejects dangerous protocols", () => {
    expect(() => validateUrl("javascript:alert(1)")).toThrow(SsrfBlockedError);
    expect(() => validateUrl("data:text/html,<script>alert(1)</script>")).toThrow(SsrfBlockedError);
    expect(() => validateUrl("file:///etc/passwd")).toThrow(SsrfBlockedError);
    expect(() => validateUrl("ftp://example.com/file")).toThrow(SsrfBlockedError);
  });

  it("rejects URLs with embedded credentials", () => {
    expect(() => validateUrl("https://user:pass@example.com")).toThrow(SsrfBlockedError);
  });

  it("rejects unparseable input", () => {
    expect(() => validateUrl("not a url")).toThrow(SsrfBlockedError);
  });

  it("accepts ordinary http/https URLs", () => {
    expect(() => validateUrl("https://example.com/page")).not.toThrow();
    expect(() => validateUrl("http://example.com/page")).not.toThrow();
  });
});

// These exercise safeFetch's actual network mechanics (redirects, caps,
// timeouts) against a real local HTTP server. The server is bound to
// 127.0.0.1, which the production isAddressAllowed check correctly
// refuses to connect to - so every test in this block that needs the
// request to actually go through passes an allow-all override
// (isAddressAllowed) that only these tests use. That override doesn't
// exist in any production code path (route.ts never sets it), so this
// is testing safeFetch's transport logic in isolation from the address
// policy, not weakening it.
describe("safeFetch (real local server)", () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server!.close(resolve));
      server = null;
    }
  });

  function listen(handler: http.RequestListener): Promise<string> {
    return new Promise((resolve) => {
      server = http.createServer(handler);
      server.listen(0, "127.0.0.1", () => {
        const { port } = server!.address() as AddressInfo;
        resolve(`http://127.0.0.1:${port}`);
      });
    });
  }

  const allowAll = () => true;

  it("without an override, refuses to connect to a real local server at all (the actual safety property)", async () => {
    const base = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html></html>");
    });
    await expect(safeFetch(base)).rejects.toThrow(SsrfBlockedError);
  });

  it("with the test override, performs a normal GET", async () => {
    const base = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><title>Hi</title></html>");
    });
    const result = await safeFetch(base, { isAddressAllowed: allowAll });
    expect(result.statusCode).toBe(200);
    expect(result.body.toString("utf-8")).toContain("<title>Hi</title>");
  });

  it("follows a redirect and fetches the final destination", async () => {
    const base = await listen((req, res) => {
      if (req.url === "/start") {
        res.writeHead(302, { location: "/final" });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><title>Final page</title></html>");
    });
    const result = await safeFetch(`${base}/start`, { isAddressAllowed: allowAll });
    expect(result.statusCode).toBe(200);
    expect(result.body.toString("utf-8")).toContain("Final page");
  });

  it("gives up after too many redirects", async () => {
    const base = await listen((_req, res) => {
      // Every request redirects to itself - an infinite redirect loop.
      res.writeHead(301, { location: "/" });
      res.end();
    });
    await expect(
      safeFetch(base, { isAddressAllowed: allowAll, maxRedirects: 2 })
    ).rejects.toThrow(SsrfBlockedError);
  });

  it("times out against a server that never responds", async () => {
    const base = await listen(() => {
      // Never call res.end() - the request should time out rather than hang.
    });
    await expect(
      safeFetch(base, { isAddressAllowed: allowAll, timeoutMs: 200 })
    ).rejects.toThrow();
  });

  it("truncates a response larger than maxBytes instead of buffering it all", async () => {
    const big = "x".repeat(100_000);
    const base = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(big);
    });
    const result = await safeFetch(base, { isAddressAllowed: allowAll, maxBytes: 1_000 });
    expect(result.body.length).toBeLessThan(big.length);
    expect(result.body.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from "vitest";
import zlib from "zlib";
import { isDisallowedIPv4, isDisallowedIPv6, decompressBody } from "../ssrf-guard";

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

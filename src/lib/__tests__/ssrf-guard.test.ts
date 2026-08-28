import { describe, it, expect } from "vitest";
import { isDisallowedIPv4, isDisallowedIPv6 } from "../ssrf-guard";

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

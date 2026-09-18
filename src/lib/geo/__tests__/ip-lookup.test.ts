import { describe, it, expect } from "vitest";
import { resolveCountryFromIp } from "../ip-lookup";

describe("resolveCountryFromIp", () => {
  it("resolves a known public IP to a country code", () => {
    // 8.8.8.8 (Google DNS) is a stable, well-known US-registered address
    // commonly used as a geoip-lite smoke-test fixture.
    expect(resolveCountryFromIp("8.8.8.8")).toBe("US");
  });

  it("returns null for a loopback/private address rather than guessing", () => {
    expect(resolveCountryFromIp("127.0.0.1")).toBeNull();
  });

  it("returns null for a malformed IP rather than throwing", () => {
    expect(resolveCountryFromIp("not-an-ip")).toBeNull();
  });
});

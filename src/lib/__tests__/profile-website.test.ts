import { describe, it, expect } from "vitest";
import { normalizeProfileWebsite } from "@/lib/profile-website";

// Regression coverage for a stored-XSS vector: the profile "website"
// (and journalist portfolio / article source URL) is rendered straight
// into an <a href>, and React 18 does not block `javascript:` hrefs.
describe("normalizeProfileWebsite", () => {
  it.each([
    "javascript:alert(document.cookie)",
    "JavaScript:fetch('/api/user/delete/confirm',{method:'POST'})",
    "  javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ])("rejects non-http(s) scheme %s", (value) => {
    expect(normalizeProfileWebsite(value).ok).toBe(false);
  });

  it("accepts and keeps http(s) URLs", () => {
    expect(normalizeProfileWebsite("https://example.com/me")).toEqual({ ok: true, value: "https://example.com/me" });
    expect(normalizeProfileWebsite("http://example.com")).toEqual({ ok: true, value: "http://example.com" });
  });

  it("prepends https:// to a bare host (and host:port), never leaving a scheme-less href", () => {
    expect(normalizeProfileWebsite("example.com")).toEqual({ ok: true, value: "https://example.com" });
    expect(normalizeProfileWebsite("example.com:8080/x")).toEqual({ ok: true, value: "https://example.com:8080/x" });
    // Looks like host:port - becomes an https URL, never a live javascript: href.
    const tricky = normalizeProfileWebsite("javascript:1");
    if (tricky.ok) expect(tricky.value?.startsWith("https://")).toBe(true);
  });

  it("treats empty/missing as clearing the field", () => {
    expect(normalizeProfileWebsite("")).toEqual({ ok: true, value: null });
    expect(normalizeProfileWebsite("   ")).toEqual({ ok: true, value: null });
    expect(normalizeProfileWebsite(null)).toEqual({ ok: true, value: null });
    expect(normalizeProfileWebsite(undefined)).toEqual({ ok: true, value: null });
  });

  it("rejects non-strings", () => {
    expect(normalizeProfileWebsite(42).ok).toBe(false);
    expect(normalizeProfileWebsite({}).ok).toBe(false);
  });
});

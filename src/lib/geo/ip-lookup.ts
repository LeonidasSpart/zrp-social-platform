import geoip from "geoip-lite";

// ─── Privacy-first IP -> country resolution ─────────────────────────
//
// Used exactly once, at registration (POST /api/auth/register), to set
// the immutable `User.signupCountryCode` snapshot. Deliberately built
// on `geoip-lite` (Apache-2.0, npm package `geoip-lite`) rather than a
// third-party geolocation API:
//   - the country-level IP database ships inside the package itself -
//     resolution is a local, in-process table lookup, so the
//     registering request's IP is never sent to any external service;
//   - no API key, no per-request network call, no additional runtime
//     dependency on a third party being reachable or rate-limiting us.
//
// The caller passes the IP already resolved by `getRequestIp()` /
// `getClientIpFromHeaders()` in src/lib/rate-limit.ts (which counts in
// from the right of X-Forwarded-For by TRUSTED_PROXY_HOPS, so it can't
// be spoofed by a client-supplied header) - this module does not read
// request headers itself. The raw IP string passed in is used only for
// this one lookup and is never written to the database; only the
// resolved two-letter country code (or null) is ever persisted.
export function resolveCountryFromIp(ip: string): string | null {
  const result = geoip.lookup(ip);
  return result?.country ?? null;
}

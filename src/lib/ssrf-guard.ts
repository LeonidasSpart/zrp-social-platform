import dns from "dns";
import net from "net";
import http from "http";
import https from "https";
import zlib from "zlib";

/*
 * ============================================================
 * SSRF-safe outbound fetch for user-supplied URLs
 * ============================================================
 *
 * Used anywhere the server fetches a URL a user typed in (link
 * previews today; anything similar later). Without this, an
 * attacker can point the server at internal services, localhost,
 * or cloud metadata endpoints (e.g. 169.254.169.254) and read the
 * response back through the preview.
 *
 * Protections:
 *  - only http/https schemes allowed
 *  - hostnames/IPs resolving to private, loopback, link-local,
 *    multicast or otherwise reserved ranges are rejected
 *  - the DNS lookup used for the actual TCP connection is the same
 *    one that was validated (via a custom `lookup` passed to
 *    http/https.request), closing the DNS-rebinding gap where a
 *    hostname resolves to a public IP at check time and a private
 *    one at connect time
 *  - redirects are followed manually, re-validating every hop
 *  - hard timeout and response-size cap
 */

const MAX_REDIRECTS = 5;

export function isDisallowedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments / TEST-NET tail
  if (a === 192 && b === 168) return true; // private
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast (224-239) + reserved (240-255) + broadcast
  return false;
}

export function isDisallowedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  if (normalized === "::1" || normalized === "::") return true; // loopback / unspecified
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true; // fe80::/10 link-local
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // fc00::/7 unique local

  // IPv4-mapped (::ffff:a.b.c.d) - validate the embedded IPv4 address.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isDisallowedIPv4(mapped[1]);

  return false;
}

function isDisallowedIp(ip: string, family: number): boolean {
  if (family === 6) return isDisallowedIPv6(ip);
  return isDisallowedIPv4(ip);
}

// The real check every production call site uses. Exposed only so tests
// can override it (see IsAddressAllowedFn below) - production code never
// passes an override, so this stays the sole gate that matters at runtime.
function defaultIsAddressAllowed(ip: string, family: number): boolean {
  return !isDisallowedIp(ip, family);
}

export type IsAddressAllowedFn = (ip: string, family: number) => boolean;

class SsrfBlockedError extends Error {
  constructor(message = "This URL cannot be reached.") {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

/**
 * Custom `lookup` for http(s).request: resolves the hostname, rejects
 * outright if every candidate address is disallowed, and otherwise
 * hands back only an allowed address so the connection can never land
 * on a private/internal target - even if the hostname's DNS record
 * later changes (rebinding).
 */
function makeSafeLookup(isAddressAllowed: IsAddressAllowedFn) {
  return function safeLookup(
    hostname: string,
    options: dns.LookupAllOptions | number,
    callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
  ) {
    const asIpFamily = net.isIP(hostname);
    if (asIpFamily) {
      if (!isAddressAllowed(hostname, asIpFamily)) {
        callback(new SsrfBlockedError(), "", 0);
        return;
      }
      callback(null, hostname, asIpFamily);
      return;
    }

    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) {
        callback(err, "", 0);
        return;
      }

      const allowed = addresses.find((a) => isAddressAllowed(a.address, a.family));

      if (!allowed) {
        callback(new SsrfBlockedError(), "", 0);
        return;
      }

      callback(null, allowed.address, allowed.family);
    });
  };
}

/**
 * Reverses standard HTTP content-coding (gzip/deflate/br) so callers
 * always see the real bytes. Node's http/https client does this
 * automatically nowhere - unlike a browser or `fetch()`, a raw
 * `http.request`/`https.request` hands back exactly what was on the
 * wire. Most modern hosting (Cloudflare, Fastly, nginx with gzip on,
 * etc.) compresses HTML by default, including for requests that never
 * asked for it via Accept-Encoding - so without this, treating the
 * compressed bytes as UTF-8 text silently produces garbage that no
 * meta-tag regex will ever match, indistinguishable from "the page
 * really has no metadata." Failure here (e.g. a response truncated
 * mid-stream by the maxBytes cap below, which can land inside a gzip
 * frame) falls back to the raw bytes rather than throwing - the worst
 * case is the same "no metadata found" outcome this replaces.
 */
export function decompressBody(body: Buffer, contentEncoding?: string): Buffer {
  const encoding = (contentEncoding || "").toLowerCase().trim();
  try {
    if (encoding === "gzip" || encoding === "x-gzip") return zlib.gunzipSync(body);
    if (encoding === "deflate") return zlib.inflateSync(body);
    if (encoding === "br") return zlib.brotliDecompressSync(body);
  } catch {
    // Truncated or malformed stream - the raw bytes are the best
    // fallback available.
  }
  return body;
}

export interface SafeFetchResult {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  // Test-only escape hatch: every production call site (link-preview's
  // route.ts included) leaves this unset and gets the real private/
  // loopback/link-local block. It exists purely so tests can point
  // safeFetch at an ephemeral 127.0.0.1 server to exercise the real
  // redirect-following, timeout and maxBytes mechanics - which the real
  // guard would otherwise correctly refuse to connect to at all - without
  // touching what ships to production.
  isAddressAllowed?: IsAddressAllowedFn;
}

export function validateUrl(urlString: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new SsrfBlockedError("Invalid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfBlockedError("Only http/https URLs are allowed.");
  }

  // Reject credentials embedded in the URL (user:pass@host) - not an
  // SSRF vector by itself, but not something a preview fetch should
  // ever forward.
  if (parsed.username || parsed.password) {
    throw new SsrfBlockedError("URLs with embedded credentials are not allowed.");
  }

  return parsed;
}

export async function safeFetch(
  urlString: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const {
    headers = {},
    timeoutMs = 6000,
    maxBytes = 200_000,
    maxRedirects = MAX_REDIRECTS,
    isAddressAllowed = defaultIsAddressAllowed,
  } = options;

  const safeLookup = makeSafeLookup(isAddressAllowed);

  let target = validateUrl(urlString);
  let redirectsLeft = maxRedirects;

  while (true) {
    // Node's net module special-cases a literal IP host: when
    // options.host is already an IP address, Socket.connect() skips the
    // custom `lookup` entirely and connects directly - so a URL like
    // http://127.0.0.1/ or http://169.254.169.254/ (cloud metadata) would
    // reach its target completely unchecked despite the safeLookup
    // passed below, since safeLookup is never even invoked for those.
    // This check is what actually gates a literal-IP host; safeLookup
    // below is what gates a hostname that only resolves to one via DNS.
    const hostIpFamily = net.isIP(target.hostname);
    if (hostIpFamily && !isAddressAllowed(target.hostname, hostIpFamily)) {
      throw new SsrfBlockedError();
    }

    const client = target.protocol === "https:" ? https : http;

    const result = await new Promise<SafeFetchResult | { redirectTo: string }>((resolve, reject) => {
      const req = client.request(
        target,
        {
          method: "GET",
          headers,
          lookup: safeLookup as unknown as typeof dns.lookup,
          timeout: timeoutMs,
        },
        (res) => {
          const status = res.statusCode || 0;

          if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
            res.resume(); // drain, don't buffer the redirect body
            resolve({ redirectTo: res.headers.location });
            return;
          }

          const chunks: Buffer[] = [];
          let received = 0;

          res.on("data", (chunk: Buffer) => {
            received += chunk.length;
            if (received > maxBytes) {
              // The chunk that crosses the cap is often the *only* chunk
              // (a small/fast response, e.g. from a local or otherwise
              // low-latency server, frequently arrives as a single TCP
              // read) - slicing in the remaining budget rather than
              // dropping this chunk entirely is what keeps that case from
              // resolving with an empty body instead of a truncated one.
              const remaining = maxBytes - (received - chunk.length);
              if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
              res.destroy();
              resolve({
                statusCode: status,
                headers: res.headers,
                body: decompressBody(Buffer.concat(chunks), res.headers["content-encoding"]),
              });
              return;
            }
            chunks.push(chunk);
          });

          res.on("end", () => {
            resolve({
              statusCode: status,
              headers: res.headers,
              body: decompressBody(Buffer.concat(chunks), res.headers["content-encoding"]),
            });
          });

          res.on("error", reject);
        }
      );

      req.on("timeout", () => req.destroy(new Error("Request timed out")));
      req.on("error", reject);
      req.end();
    });

    if ("redirectTo" in result) {
      if (redirectsLeft <= 0) {
        throw new SsrfBlockedError("Too many redirects.");
      }
      redirectsLeft -= 1;
      target = validateUrl(new URL(result.redirectTo, target).toString());
      continue;
    }

    return result;
  }
}

export { SsrfBlockedError };

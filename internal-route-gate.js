/*
 * Loopback-only gate for /api/internal/*, extracted from server.js so it
 * can be unit-tested directly (same pattern as redis-readiness.js).
 *
 * /api/internal/call-push is called only by server.js itself, over
 * 127.0.0.1. Anything else - in particular every request that came in
 * through the reverse proxy, which always connects from a non-loopback
 * address and adds X-Forwarded-For - is refused before Next.js sees it,
 * so the route's bearer secret is never exposed to online guessing.
 *
 * This must look at the raw socket, here in server.js: by the time a
 * route handler runs, Next.js has already set X-Forwarded-For to the
 * socket address on every request, so the route cannot tell the two
 * apart from headers.
 */
function isInternalApiPath(pathname) {
  let p = pathname || "";
  try {
    p = decodeURIComponent(p);
  } catch {
    // Malformed encoding: fall through with the raw path.
  }
  // Normalized (decoded, slashes collapsed, lowercased) so an encoded or
  // doubled-slash variant of the path can't slip past the check.
  p = p.replace(/[\\/]+/g, "/").toLowerCase();
  return p.startsWith("/api/internal");
}

function isLoopbackRequest(req) {
  const addr = (req.socket && req.socket.remoteAddress) || "";
  const loopback = addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
  return loopback && !req.headers["x-forwarded-for"];
}

/** True when this request must be refused with a 404. */
function isBlockedInternalRequest(req, pathname) {
  return isInternalApiPath(pathname) && !isLoopbackRequest(req);
}

module.exports = { isInternalApiPath, isLoopbackRequest, isBlockedInternalRequest };

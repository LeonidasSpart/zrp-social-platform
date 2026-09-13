import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import vm from "vm";

/*
 * REGRESSION for the finding closed in the backend completion mission:
 * public/sw.js's fetch handler used to route ANY request that was
 * neither "/" nor mode==='navigate' through cache-first (its old rule
 * 3). Next.js App Router's own client-side navigation/prefetch requests
 * (a <Link> click, router.push(), or a prefetch) are plain same-origin
 * fetch() calls the router issues to the SAME page path, carrying an
 * `RSC: 1` header - see node_modules/next/dist/client/components/
 * router-reducer/fetch-server-response.js's createFetch(), which calls
 * `fetch(fetchUrl, { credentials: 'same-origin', headers, ... })` with no
 * `mode` option, so it defaults to 'cors'. The Fetch/Service-Worker spec
 * reserves mode:'navigate' for an actual browser-level navigation - it
 * can never be produced by a fetch() call, no matter what headers are
 * set. So an RSC request satisfied neither of rule 2's old conditions
 * and fell through to cache-first, exactly like a JS/CSS file - a second
 * client-side visit to the same personalized route could be served a
 * stale cached RSC payload (or another account's, on a shared device)
 * instead of a fresh network response.
 *
 * This loads the REAL public/sw.js source into a sandboxed vm (same
 * technique as service-worker-push.test.ts) and drives its actual fetch
 * listener, proving:
 *  - a request shaped exactly like Next's RSC navigation fetch now goes
 *    network-first (the fix), not cache-first;
 *  - a real static asset (a hashed _next/static chunk, a precached icon)
 *    still goes cache-first, so the fix didn't regress the thing rule 3
 *    exists for.
 */
function loadServiceWorker(cacheMatchResult: any = undefined) {
  const source = readFileSync(path.join(__dirname, "../../../public/sw.js"), "utf-8");
  const listeners: Record<string, (event: any) => void> = {};
  const networkFetch = vi.fn();
  const cachePut = vi.fn().mockResolvedValue(undefined);
  const cacheMatch = vi.fn().mockResolvedValue(cacheMatchResult);
  const cachesOpen = vi.fn().mockResolvedValue({ put: cachePut, addAll: vi.fn().mockResolvedValue(undefined) });
  const cachesMatch = vi.fn().mockImplementation((req) => cacheMatch(req));

  const sandbox: any = {
    self: {
      addEventListener: (name: string, handler: (event: any) => void) => {
        listeners[name] = handler;
      },
      skipWaiting: vi.fn(),
    },
    caches: { open: cachesOpen, keys: vi.fn().mockResolvedValue([]), delete: vi.fn(), match: cachesMatch },
    clients: { claim: vi.fn(), openWindow: vi.fn() },
    fetch: networkFetch,
    console: { warn: vi.fn(), error: vi.fn() },
    URL,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  return { listeners, networkFetch, cachePut, cacheMatch, cachesOpen };
}

function makeRequest(url: string, mode: string) {
  return { url, method: "GET", mode };
}

function fireFetch(listener: (event: any) => void, request: any) {
  let responded: Promise<unknown> | undefined;
  const waited: Promise<unknown>[] = [];
  listener({
    request,
    respondWith: (p: Promise<unknown>) => {
      responded = p;
    },
    waitUntil: (p: Promise<unknown>) => waited.push(p),
  });
  return { responded, waited };
}

describe("public/sw.js fetch handler - static-asset vs personalized-route classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("REGRESSION: an RSC-shaped client-side navigation request (mode 'cors', page pathname) goes network-first, not cache-first", async () => {
    const { listeners, networkFetch, cachePut, cacheMatch } = loadServiceWorker();
    networkFetch.mockResolvedValue({ status: 200, clone: () => "cloned-network-response" });

    // Exactly what Next's router issues for a <Link>/router.push()/prefetch:
    // a plain fetch() (mode defaults to 'cors') to the page's own path.
    const request = makeRequest("https://zrp.example/profile/alice", "cors");
    const { responded } = fireFetch(listeners.fetch, request);
    await responded;

    // Network was tried FIRST - the defining behavior of rule 2.
    expect(networkFetch).toHaveBeenCalledWith(request);
    // On success it also updates the cache (rule 2's own behavior) -
    // the fix does not disable caching, only which strategy runs first.
    expect(cachePut).toHaveBeenCalledWith(request, "cloned-network-response");
    // Rule 3's read-cache-first path was never consulted.
    expect(cacheMatch).not.toHaveBeenCalled();
  });

  it("a genuine static asset (hashed _next/static chunk) still goes cache-first", async () => {
    const cachedResponse = { status: 200, marker: "from-cache" };
    const { listeners, networkFetch, cacheMatch } = loadServiceWorker(cachedResponse);
    networkFetch.mockResolvedValue({ status: 200, clone: () => "cloned" });

    const request = makeRequest("https://zrp.example/_next/static/chunks/app-abc123.js", "cors");
    const { responded } = fireFetch(listeners.fetch, request);
    const result = await responded;

    // Cache was consulted first and its (fresh) entry was returned directly.
    expect(cacheMatch).toHaveBeenCalledWith(request);
    expect(result).toBe(cachedResponse);
  });

  it("a precached static icon (in STATIC_ASSETS) still goes cache-first", async () => {
    const cachedResponse = { status: 200, marker: "cached-icon" };
    const { listeners, networkFetch, cacheMatch } = loadServiceWorker(cachedResponse);
    networkFetch.mockResolvedValue({ status: 200, clone: () => "cloned" });

    const request = makeRequest("https://zrp.example/icon-192.png", "cors");
    const { responded } = fireFetch(listeners.fetch, request);
    const result = await responded;

    expect(cacheMatch).toHaveBeenCalledWith(request);
    expect(result).toBe(cachedResponse);
  });

  it("a real full-page navigation (mode 'navigate') still goes network-first, unchanged from before", async () => {
    const { listeners, networkFetch, cacheMatch } = loadServiceWorker();
    networkFetch.mockResolvedValue({ status: 200, clone: () => "cloned" });

    const request = makeRequest("https://zrp.example/messages/bob", "navigate");
    const { responded } = fireFetch(listeners.fetch, request);
    await responded;

    expect(networkFetch).toHaveBeenCalledWith(request);
    expect(cacheMatch).not.toHaveBeenCalled();
  });

  it("API calls and non-GET requests are still left untouched (never routed to either rule)", () => {
    const { listeners, networkFetch, cacheMatch } = loadServiceWorker();

    const apiRequest = { url: "https://zrp.example/api/posts", method: "GET", mode: "cors" };
    const { responded: apiResponded } = fireFetch(listeners.fetch, apiRequest);
    expect(apiResponded).toBeUndefined();

    const postRequest = makeRequest("https://zrp.example/profile/alice", "cors");
    (postRequest as any).method = "POST";
    const { responded: postResponded } = fireFetch(listeners.fetch, postRequest);
    expect(postResponded).toBeUndefined();

    expect(networkFetch).not.toHaveBeenCalled();
    expect(cacheMatch).not.toHaveBeenCalled();
  });
});

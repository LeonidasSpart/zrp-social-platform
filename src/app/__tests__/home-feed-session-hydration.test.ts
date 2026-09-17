import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/*
 * Regression coverage for a real production performance bug: the home
 * feed's very first data fetch was gated on `session?.user?.id`, and
 * that value only existed after next-auth's useSession() resolved -
 * which, without a server-hydrated session, meant an extra client-side
 * round trip to /api/auth/session before the feed request could even
 * start. The route is unconditionally auth-guaranteed by middleware
 * (see src/middleware.ts: "/" is neither in PUBLIC_PATHS nor
 * AUTH_FLOW_PATHS, and an unauthenticated visitor is redirected to
 * /login before this page's JS ever runs), so waiting on the client's
 * own copy of something the server already guarantees was pure added
 * latency on the first screen a user sees after login - exactly the
 * "app feels slow" complaint being fixed here.
 *
 * vitest runs environment: "node" project-wide (no jsdom/React
 * rendering - see useBodyScrollLock.test.ts's own comment), so this is
 * a source-level regression guard rather than a rendered-behavior test:
 * it locks in that the fetch effect no longer depends on session state,
 * and that the fix is actually wired the way the evidence says it is
 * (server-resolved session flowing into SessionProvider).
 */

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("home feed initial load is not gated on client-resolved session", () => {
  it("page.tsx no longer waits on session?.user?.id before loading posts", () => {
    const source = read("src/app/page.tsx");
    expect(source).not.toMatch(/if\s*\(\s*userId\s*\)\s*\{\s*loadPosts\(\)/);
    expect(source).not.toContain("const userId = session?.user?.id");
  });

  it("the feed-loading effect depends only on feedType/loadPosts, not on the session", () => {
    const source = read("src/app/page.tsx");
    expect(source).toMatch(/useEffect\(\(\)\s*=>\s*\{\s*loadPosts\(\);\s*\},\s*\[\s*feedType,\s*loadPosts,?\s*\n?\s*\]\)/);
  });
});

describe("SessionProvider is hydrated server-side to avoid a client-only session round trip", () => {
  it("AuthProvider forwards a server-resolved session into next-auth's SessionProvider", () => {
    const source = read("src/components/AuthProvider.tsx");
    expect(source).toContain("session: Session | null");
    expect(source).toContain("<SessionProvider session={session}>");
  });

  it("the root layout resolves the session server-side via getServerSession and passes it down", () => {
    const source = read("src/app/layout.tsx");
    expect(source).toContain("getServerSession(authOptions)");
    expect(source).toContain("<AuthProvider session={session}>");
  });
});

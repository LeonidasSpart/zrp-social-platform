import { defineConfig } from "vitest/config";
import path from "path";

// ⚠️ Prisma 7+: neither the CLI nor the generated client auto-loads
// .env anymore (previously true of Prisma 6's client, which is what
// silently made DATABASE_URL/REDIS_URL available to every integration
// test's `hasRealDatabaseUrl` check without this). CI is unaffected -
// ci.yml sets these as real environment variables directly - but any
// local `npm test` run needs this explicit load or every DB/Redis-gated
// integration test silently (and misleadingly) reports as "skipped"
// rather than failing loudly.
import "dotenv/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The integration test files share one live Postgres instance and
    // a single Prisma client (globalThis-cached, see src/lib/db.ts).
    // Running test *files* in parallel is otherwise fine for the pure
    // unit tests, but two integration suites seeding/tearing down
    // overlapping data concurrently is a real source of flakiness
    // independent of the code under test - keep files sequential.
    fileParallelism: false,
    server: {
      deps: {
        // @pump-fun/pump-sdk's ESM build pulls in @pump-fun/agent-payments-sdk,
        // whose ESM build does `import { BN } from "@coral-xyz/anchor"` - a
        // named import from a CJS package. Externalized (Vitest's default for
        // node_modules), Node's own ESM loader can't always synthesize that
        // named export via its CJS interop heuristic and the import throws.
        // Inlining both here routes them through Vite's own esbuild-based
        // commonjs transform instead, which handles this interop correctly -
        // this only affects how the test runner loads the packages, not how
        // Next.js's own bundler resolves them for the real app.
        inline: ["@pump-fun/agent-payments-sdk", "@coral-xyz/anchor"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

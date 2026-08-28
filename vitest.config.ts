import { defineConfig } from "vitest/config";
import path from "path";

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
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

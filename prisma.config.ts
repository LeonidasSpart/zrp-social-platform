// Prisma 7+ CLI configuration (generate/migrate/studio). This never runs
// inside the deployed app - server.js/Next.js load DATABASE_URL on their
// own, and src/lib/db.ts passes it straight to the PrismaPg driver
// adapter. This file's only job is telling the CLI, which no longer
// auto-loads .env or reads a `url` from schema.prisma, where to find
// both. See https://pris.ly/d/config-datasource.
//
// ⚠️ `prisma/config`'s own `env()` helper throws at config-load time if
// the variable isn't set at all - which broke `prisma generate` (run by
// every `npm install` via postinstall) in any environment without
// DATABASE_URL, including CI's typecheck/lint job and the Android
// build's web-asset step, neither of which touch a database at all.
// Reading `process.env.DATABASE_URL` directly instead just resolves to
// undefined there - generate doesn't need a real connection, so this is
// a strict relaxation with no effect on the commands (migrate/db push)
// that do.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});

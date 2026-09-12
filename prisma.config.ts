// Prisma 7+ CLI configuration (generate/migrate/studio). This never runs
// inside the deployed app - server.js/Next.js load DATABASE_URL on their
// own, and src/lib/db.ts passes it straight to the PrismaPg driver
// adapter. This file's only job is telling the CLI, which no longer
// auto-loads .env or reads a `url` from schema.prisma, where to find
// both. See https://pris.ly/d/config-datasource.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});

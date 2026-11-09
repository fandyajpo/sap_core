import "dotenv/config";
import { defineConfig } from "prisma/config";

const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;

if (!migrationDatabaseUrl) {
  throw new Error(
    "MIGRATION_DATABASE_URL must be set for Prisma CLI commands. " +
      "Use a separately managed direct migration credential; Prisma Postgres credentials " +
      "have the same full database privileges, so this separation is for secret lifecycle only.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: migrationDatabaseUrl },
});

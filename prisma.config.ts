import "dotenv/config";
import { defineConfig } from "prisma/config";

const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;

if (!migrationDatabaseUrl) {
  throw new Error(
    "MIGRATION_DATABASE_URL must be set for Prisma CLI commands. " +
      "Use a dedicated migration credential; DATABASE_URL is reserved for application runtime.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: migrationDatabaseUrl },
});

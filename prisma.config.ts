import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Migrations use the owner connection when explicitly configured; application
  // runtime always uses DATABASE_URL from src/lib/prisma.ts.
  datasource: { url: process.env.MIGRATION_DATABASE_URL ?? env("DATABASE_URL") },
});

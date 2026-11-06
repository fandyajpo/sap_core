import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set before the Prisma Client is initialized.");
}

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
  prismaAdapter?: PrismaPg;
};

const adapter =
  globalForPrisma.prismaAdapter ?? new PrismaPg({ connectionString: databaseUrl });

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaAdapter = adapter;
}

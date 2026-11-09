import "server-only";

import { prisma } from "@/lib/prisma";
import { lockVerifiedSessionRow, type VerifiedSessionIdentity } from "@/lib/verified-session-lock";
import type {
  ScopedAccessDatabase,
  ScopedAccessSession,
} from "@/lib/scoped-access-service";

type RawQueryClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
};

function createSession(client: unknown): ScopedAccessSession {
  const rawClient = client as RawQueryClient;
  return {
    query: async <Row extends object>(statement: string, values: unknown[] = []): Promise<Row[]> => {
      const command = statement.trimStart();
      if (/^(INSERT|UPDATE|DELETE)\b/i.test(command) && !/\bRETURNING\b/i.test(command)) {
        await rawClient.$executeRawUnsafe(statement, ...values);
        return [];
      }
      return rawClient.$queryRawUnsafe<Row[]>(statement, ...values);
    },
  };
}

/**
 * Server-only persistence adapter for tenant domain services.
 *
 * There is deliberately no unbound Prisma-backed ScopedAccessDatabase export.
 * Every production adapter created here must carry the exact Better Auth
 * session identity and revalidate/lock that session in the same transaction
 * used by the protected operation. Domain services must still enforce their
 * operation-specific actor, scope, and permission policy.
 */
export function createSessionBoundScopedAccessDatabase(identity: VerifiedSessionIdentity): ScopedAccessDatabase {
  return {
    query: async <Row extends object>(_statement: string, _values: unknown[] = []): Promise<Row[]> => {
      throw new Error("Session-bound scoped access queries must run inside transaction().");
    },
    transaction: <T>(work: (session: ScopedAccessSession) => Promise<T>) =>
      prisma.$transaction(async (transaction) => {
        const session = createSession(transaction);
        await lockVerifiedSessionRow(session.query, identity);
        return work(session);
      }),
  };
}

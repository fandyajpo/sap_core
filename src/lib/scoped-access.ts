import "server-only";

import { prisma } from "@/lib/prisma";
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
 * Server-only persistence adapter for transaction-bound domain services.
 * Do not export membership/assignment lifecycle helpers from this module:
 * those operations require a verified actor and permission guard at the
 * application service boundary before they can be exposed to tenant requests.
 */
export const scopedAccessDatabase: ScopedAccessDatabase = {
  ...createSession(prisma),
  transaction: <T>(work: (session: ScopedAccessSession) => Promise<T>) =>
    prisma.$transaction((transaction) => work(createSession(transaction))),
};

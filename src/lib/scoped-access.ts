import { prisma } from "@/lib/prisma";
import {
  createScopedAccessService,
  type ScopedAccessDatabase,
  type ScopedAccessSession,
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

export const scopedAccessDatabase: ScopedAccessDatabase = {
  ...createSession(prisma),
  transaction: <T>(work: (session: ScopedAccessSession) => Promise<T>) =>
    prisma.$transaction((transaction) => work(createSession(transaction))),
};

export const scopedAccess = createScopedAccessService(scopedAccessDatabase);

export const {
  grantCompanyMembership,
  suspendCompanyMembership,
  restoreCompanyMembership,
  revokeCompanyMembership,
  endCompanyMembership,
  grantPlantAssignment,
  suspendPlantAssignment,
  restorePlantAssignment,
  revokePlantAssignment,
  endPlantAssignment,
  hasCompanyAccess,
  hasPlantAccess,
} = scopedAccess;

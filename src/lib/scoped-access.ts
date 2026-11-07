import { prisma } from "@/lib/prisma";
import {
  createScopedAccessService,
  type ScopedAccessDatabase,
  type ScopedAccessSession,
} from "@/lib/scoped-access-service";

type RawQueryClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};

function createSession(client: unknown): ScopedAccessSession {
  const rawClient = client as RawQueryClient;
  return {
    query: <Row extends object>(statement: string, values: unknown[] = []) =>
      rawClient.$queryRawUnsafe<Row[]>(statement, ...values),
  };
}

const database = {
  ...createSession(prisma),
  transaction: <T>(work: (session: ScopedAccessSession) => Promise<T>) =>
    prisma.$transaction((transaction) => work(createSession(transaction))),
} as ScopedAccessDatabase;

export const scopedAccess = createScopedAccessService(database);

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

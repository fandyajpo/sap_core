import "server-only";

import { TenantTargetContextError } from "@/lib/tenant-target-context-core";

export interface VerifiedSessionIdentity {
  sessionId: string;
  userId: string;
}

type SessionLockQuery = (
  statement: string,
  values?: unknown[],
) => Promise<Array<{ id: string }>>;

/**
 * Revalidates and locks the exact Better Auth session row inside the
 * protected operation's transaction. The caller must keep this transaction
 * open until the protected operation commits or rolls back.
 */
export async function lockVerifiedSessionRow(
  query: SessionLockQuery,
  identity: VerifiedSessionIdentity,
): Promise<void> {
  if (
    typeof identity.sessionId !== "string" ||
    identity.sessionId.length === 0 ||
    typeof identity.userId !== "string" ||
    identity.userId.length === 0
  ) {
    throw new TenantTargetContextError(
      "UNAUTHENTICATED",
      "A verified authenticated session is required.",
    );
  }

  const rows = await query(
    `SELECT s."id"::text AS "id"
       FROM "core"."session" s
      WHERE s."id" = $1
        AND s."userId" = $2
        AND s."expiresAt" > (clock_timestamp() AT TIME ZONE 'UTC')
      FOR SHARE OF s`,
    [identity.sessionId, identity.userId],
  );

  if (!rows[0]) {
    throw new TenantTargetContextError(
      "UNAUTHENTICATED",
      "The authenticated session is no longer active.",
    );
  }
}

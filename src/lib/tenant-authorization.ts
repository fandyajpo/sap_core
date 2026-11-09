import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import {
  evaluateAuthorization,
  type AuthorizationPermission,
} from "@/lib/authorization-policy-core";
import { loadAuthorizationGrants } from "@/lib/authorization-grant-loader";
import { resolveTenantTargetContext } from "@/lib/tenant-target-context";
import { TenantTargetContextError } from "@/lib/tenant-target-context-core";
import { lockVerifiedSessionRow } from "@/lib/verified-session-lock";
import type { TenantScopeRequest } from "@/lib/tenant-scope-types";

export class TenantAuthorizationError extends Error {
  readonly reason: string;

  constructor(permission: AuthorizationPermission, reason: string) {
    super(`Tenant permission ${permission} was denied: ${reason}.`);
    this.name = "TenantAuthorizationError";
    this.reason = reason;
  }
}

/**
 * Authorization and its protected operation must share this transaction client.
 * The verified session is resolved before the transaction is opened.
 */
export async function requireTenantPermission(
  tx: Prisma.TransactionClient,
  session: { session: { id: string }; user: { id: string } } | null,
  request: TenantScopeRequest,
  permission: AuthorizationPermission,
) {
  if (!session?.session?.id || !session.user?.id) {
    throw new TenantTargetContextError("UNAUTHENTICATED", "A verified authenticated session is required.");
  }

  // Lock and revalidate the exact Better Auth session before tenant GUCs or authorization reads.
  await lockVerifiedSessionRow((statement, values = []) => tx.$queryRawUnsafe<Array<{ id: string }>>(statement, ...values), {
    sessionId: session.session.id,
    userId: session.user.id,
  });

  // Actor identity is trusted only because it comes from the verified Better Auth session.
  // The third argument makes this GUC transaction-local; never replace it with session SET.
  await tx.$queryRaw`SELECT set_config('app.user_id', ${session.user.id}, true)`;

  // Resolve membership and target ancestry on the same transaction/connection.
  const context = await resolveTenantTargetContext(tx, session, request);

  // Tenant identifiers are not installed until the actor's membership and target ancestry
  // have been validated. Empty child values explicitly clear non-applicable target scopes.
  await tx.$queryRaw`
    SELECT
      set_config('app.organization_id', ${context.organizationId}, true),
      set_config('app.company_id', ${context.companyId ?? ""}, true),
      set_config('app.plant_id', ${context.plantId ?? ""}, true)
  `;

  const { actorUserId, grants, denies } = await loadAuthorizationGrants(tx, context);
  if (actorUserId !== context.userId) {
    throw new TenantAuthorizationError(permission, "ACTOR_CONTEXT_MISMATCH");
  }

  const decision = evaluateAuthorization({
    permission,
    target: {
      scope: context.scope,
      organizationId: context.organizationId,
      ...(context.companyId ? { companyId: context.companyId } : {}),
      ...(context.plantId ? { plantId: context.plantId } : {}),
    },
    grants,
    denies,
  });
  if (!decision.allowed) {
    throw new TenantAuthorizationError(permission, decision.reason);
  }

  return { context, decision };
}

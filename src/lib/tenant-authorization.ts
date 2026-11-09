import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import {
  evaluateAuthorization,
  type AuthorizationPermission,
} from "@/lib/authorization-policy-core";
import { loadAuthorizationGrants } from "@/lib/authorization-grant-loader";
import { resolveTenantTargetContext } from "@/lib/tenant-target-context";
import type { TenantScopeRequest } from "@/lib/tenant-context-core";

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
  session: { user: { id: string } } | null,
  request: TenantScopeRequest,
  permission: AuthorizationPermission,
) {
  const context = await resolveTenantTargetContext(tx, session, request);
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

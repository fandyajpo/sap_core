import "server-only";

import { evaluateAuthorization, type AuthorizationPermission } from "@/lib/authorization-policy-core";
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
 * Server-side authorization boundary for tenant operations. Call this from
 * every protected Server Action / Route Handler before reading or mutating
 * tenant-owned data. The actor and target ancestry are resolved server-side.
 */
export async function requireTenantPermission(
  request: TenantScopeRequest,
  permission: AuthorizationPermission,
) {
  const context = await resolveTenantTargetContext(request);
  const { actorUserId, grants, denies } = await loadAuthorizationGrants(context);
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

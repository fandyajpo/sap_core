import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { getCurrentSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { requireTenantPermission } from "@/lib/tenant-authorization";
import { TenantTargetContextError } from "@/lib/tenant-target-context-core";

export interface TenantResourceSummary {
  id: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function getCompany(organizationId: string, companyId: string): Promise<TenantResourceSummary> {
  const session = await getCurrentSession();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const { context } = await requireTenantPermission(tx, session, { kind: "COMPANY", organizationId, companyId }, "company.read");
    const rows = await tx.$queryRaw<TenantResourceSummary[]>`
      SELECT c."id"::text AS "id", c."organizationId"::text AS "organizationId",
             c."created_at" AS "createdAt", c."updated_at" AS "updatedAt"
      FROM "core"."company" c
      WHERE c."id" = ${context.companyId}::uuid
        AND c."organizationId" = ${context.organizationId}::uuid
      LIMIT 1
    `;
    if (!rows[0]) throw new TenantTargetContextError("TENANT_ACCESS_DENIED", "The Company is not visible in the verified tenant context.");
    return rows[0];
  });
}

export async function getPlant(organizationId: string, companyId: string, plantId: string): Promise<TenantResourceSummary> {
  const session = await getCurrentSession();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const { context } = await requireTenantPermission(tx, session, { kind: "PLANT", organizationId, companyId, plantId }, "plant.read");
    const rows = await tx.$queryRaw<TenantResourceSummary[]>`
      SELECT p."id"::text AS "id", p."organizationId"::text AS "organizationId",
             p."created_at" AS "createdAt", p."updated_at" AS "updatedAt"
      FROM "core"."plant" p
      WHERE p."id" = ${context.plantId}::uuid
        AND p."companyId" = ${context.companyId}::uuid
        AND p."organizationId" = ${context.organizationId}::uuid
      LIMIT 1
    `;
    if (!rows[0]) throw new TenantTargetContextError("TENANT_ACCESS_DENIED", "The Plant is not visible in the verified tenant context.");
    return rows[0];
  });
}

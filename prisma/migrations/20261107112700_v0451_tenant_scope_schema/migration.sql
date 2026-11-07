BEGIN;

-- CreateEnum
CREATE TYPE "core"."OrganizationMembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'ENDED');

-- CreateEnum
CREATE TYPE "core"."ScopedAccessStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED', 'ENDED');

-- CreateEnum
CREATE TYPE "core"."RoleDefinitionKind" AS ENUM ('SYSTEM', 'ORGANIZATION_CUSTOM');

-- CreateEnum
CREATE TYPE "core"."RoleScope" AS ENUM ('ORGANIZATION', 'COMPANY', 'PLANT');

-- DropForeignKey
ALTER TABLE "core"."account" DROP CONSTRAINT "account_userId_fkey";

-- DropForeignKey
ALTER TABLE "core"."session" DROP CONSTRAINT "session_userId_fkey";

-- CreateTable
CREATE TABLE "core"."organization" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."company" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."plant" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."organization_membership" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" UUID NOT NULL,
    "status" "core"."OrganizationMembershipStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."company_membership" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationMembershipId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "status" "core"."ScopedAccessStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "company_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."plant_assignment" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "companyMembershipId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "plantId" UUID NOT NULL,
    "status" "core"."ScopedAccessStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plant_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."role_definition" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "core"."RoleDefinitionKind" NOT NULL,
    "scope" "core"."RoleScope" NOT NULL,
    "ownerOrganizationId" UUID,
    "disabled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "role_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."organization_role_assignment" (
    "id" UUID NOT NULL,
    "organizationMembershipId" UUID NOT NULL,
    "roleDefinitionId" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "organization_role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."company_role_assignment" (
    "id" UUID NOT NULL,
    "companyMembershipId" UUID NOT NULL,
    "roleDefinitionId" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "company_role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."plant_role_assignment" (
    "id" UUID NOT NULL,
    "plantAssignmentId" UUID NOT NULL,
    "roleDefinitionId" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "plant_role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_organizationId_idx" ON "core"."company"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "company_organization_id_id_key" ON "core"."company"("organizationId", "id");

-- CreateIndex
CREATE INDEX "plant_organizationId_companyId_idx" ON "core"."plant"("organizationId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "plant_organization_company_id_key" ON "core"."plant"("organizationId", "companyId", "id");

-- CreateIndex
CREATE INDEX "organization_membership_userId_status_idx" ON "core"."organization_membership"("userId", "status");

-- CreateIndex
CREATE INDEX "organization_membership_organizationId_status_idx" ON "core"."organization_membership"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_membership_id_user_org_key" ON "core"."organization_membership"("id", "userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_membership_user_slot_key" ON "core"."organization_membership"("userId") WHERE (status IN ('ACTIVE','SUSPENDED'));

-- CreateIndex
CREATE INDEX "company_membership_userId_status_idx" ON "core"."company_membership"("userId", "status");

-- CreateIndex
CREATE INDEX "company_membership_organizationMembershipId_userId_organiza_idx" ON "core"."company_membership"("organizationMembershipId", "userId", "organizationId");

-- CreateIndex
CREATE INDEX "company_membership_organizationId_companyId_idx" ON "core"."company_membership"("organizationId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "company_membership_id_user_org_company_key" ON "core"."company_membership"("id", "userId", "organizationId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "company_membership_user_company_current_key" ON "core"."company_membership"("userId", "companyId") WHERE (status IN ('ACTIVE','SUSPENDED'));

-- CreateIndex
CREATE INDEX "plant_assignment_userId_status_idx" ON "core"."plant_assignment"("userId", "status");

-- CreateIndex
CREATE INDEX "plant_assignment_companyMembershipId_userId_organizationId__idx" ON "core"."plant_assignment"("companyMembershipId", "userId", "organizationId", "companyId");

-- CreateIndex
CREATE INDEX "plant_assignment_organizationId_companyId_plantId_idx" ON "core"."plant_assignment"("organizationId", "companyId", "plantId");

-- CreateIndex
CREATE UNIQUE INDEX "plant_assignment_user_plant_current_key" ON "core"."plant_assignment"("userId", "plantId") WHERE (status IN ('ACTIVE','SUSPENDED'));

-- CreateIndex
CREATE INDEX "role_definition_ownerOrganizationId_idx" ON "core"."role_definition"("ownerOrganizationId");

-- CreateIndex
CREATE INDEX "organization_role_assignment_organizationMembershipId_idx" ON "core"."organization_role_assignment"("organizationMembershipId");

-- CreateIndex
CREATE INDEX "organization_role_assignment_roleDefinitionId_idx" ON "core"."organization_role_assignment"("roleDefinitionId");

-- CreateIndex
CREATE INDEX "company_role_assignment_companyMembershipId_idx" ON "core"."company_role_assignment"("companyMembershipId");

-- CreateIndex
CREATE INDEX "company_role_assignment_roleDefinitionId_idx" ON "core"."company_role_assignment"("roleDefinitionId");

-- CreateIndex
CREATE INDEX "plant_role_assignment_plantAssignmentId_idx" ON "core"."plant_role_assignment"("plantAssignmentId");

-- CreateIndex
CREATE INDEX "plant_role_assignment_roleDefinitionId_idx" ON "core"."plant_role_assignment"("roleDefinitionId");

-- AddForeignKey
ALTER TABLE "core"."session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "core"."user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "core"."user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."company" ADD CONSTRAINT "company_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."plant" ADD CONSTRAINT "plant_organizationId_companyId_fkey" FOREIGN KEY ("organizationId", "companyId") REFERENCES "core"."company"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."organization_membership" ADD CONSTRAINT "organization_membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "core"."user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."organization_membership" ADD CONSTRAINT "organization_membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "core"."organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."company_membership" ADD CONSTRAINT "company_membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "core"."user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."company_membership" ADD CONSTRAINT "company_membership_organizationMembershipId_userId_organiz_fkey" FOREIGN KEY ("organizationMembershipId", "userId", "organizationId") REFERENCES "core"."organization_membership"("id", "userId", "organizationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."company_membership" ADD CONSTRAINT "company_membership_organizationId_companyId_fkey" FOREIGN KEY ("organizationId", "companyId") REFERENCES "core"."company"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."plant_assignment" ADD CONSTRAINT "plant_assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "core"."user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."plant_assignment" ADD CONSTRAINT "plant_assignment_companyMembershipId_userId_organizationId_fkey" FOREIGN KEY ("companyMembershipId", "userId", "organizationId", "companyId") REFERENCES "core"."company_membership"("id", "userId", "organizationId", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."plant_assignment" ADD CONSTRAINT "plant_assignment_organizationId_companyId_plantId_fkey" FOREIGN KEY ("organizationId", "companyId", "plantId") REFERENCES "core"."plant"("organizationId", "companyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."organization_role_assignment" ADD CONSTRAINT "organization_role_assignment_organizationMembershipId_fkey" FOREIGN KEY ("organizationMembershipId") REFERENCES "core"."organization_membership"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."organization_role_assignment" ADD CONSTRAINT "organization_role_assignment_roleDefinitionId_fkey" FOREIGN KEY ("roleDefinitionId") REFERENCES "core"."role_definition"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."company_role_assignment" ADD CONSTRAINT "company_role_assignment_companyMembershipId_fkey" FOREIGN KEY ("companyMembershipId") REFERENCES "core"."company_membership"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."company_role_assignment" ADD CONSTRAINT "company_role_assignment_roleDefinitionId_fkey" FOREIGN KEY ("roleDefinitionId") REFERENCES "core"."role_definition"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."plant_role_assignment" ADD CONSTRAINT "plant_role_assignment_plantAssignmentId_fkey" FOREIGN KEY ("plantAssignmentId") REFERENCES "core"."plant_assignment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "core"."plant_role_assignment" ADD CONSTRAINT "plant_role_assignment_roleDefinitionId_fkey" FOREIGN KEY ("roleDefinitionId") REFERENCES "core"."role_definition"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;

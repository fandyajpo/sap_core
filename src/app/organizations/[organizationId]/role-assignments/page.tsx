import { RoleAssignmentsView } from "@/components/role-assignments/role-assignments-view";
import { OrganizationShell } from "@/components/organization-shell/organization-shell";
import { requireCurrentSession } from "@/lib/auth-session";

interface RoleAssignmentsPageProps {
  params: Promise<{ organizationId: string }>;
}

export default async function RoleAssignmentsPage({
  params,
}: RoleAssignmentsPageProps) {
  await requireCurrentSession();
  const { organizationId } = await params;

  return (
    <OrganizationShell activeSection="assignments" organizationId={organizationId}>
      <RoleAssignmentsView organizationId={organizationId} />
    </OrganizationShell>
  );
}

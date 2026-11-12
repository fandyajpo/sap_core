import { OrganizationShell } from "@/components/organization-shell/organization-shell";
import { RoleAssignmentsView } from "@/components/role-assignments/role-assignments-view";
import { requireCurrentSession } from "@/lib/auth-session";

interface RoleAssignmentsPageProps {
  params: Promise<{ organizationId: string }>;
}

export default async function RoleAssignmentsPage({
  params,
}: RoleAssignmentsPageProps) {
  const session = await requireCurrentSession();
  const { organizationId } = await params;

  return (
    <OrganizationShell
      account={{ email: session.user.email, name: session.user.name }}
      organizationId={organizationId}
    >
      <RoleAssignmentsView organizationId={organizationId} />
    </OrganizationShell>
  );
}

import { OrganizationRolesView } from "@/components/organization-roles/organization-roles-view";
import { OrganizationShell } from "@/components/organization-shell/organization-shell";
import { requireCurrentSession } from "@/lib/auth-session";

interface OrganizationRolesPageProps {
  params: Promise<{ organizationId: string }>;
}

export default async function OrganizationRolesPage({
  params,
}: OrganizationRolesPageProps) {
  const session = await requireCurrentSession();
  const { organizationId } = await params;

  return (
    <OrganizationShell
      account={{ email: session.user.email, name: session.user.name }}
      organizationId={organizationId}
    >
      <OrganizationRolesView organizationId={organizationId} />
    </OrganizationShell>
  );
}

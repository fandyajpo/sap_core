import { OrganizationRolesView } from "@/components/organization-roles/organization-roles-view";
import { OrganizationShell } from "@/components/organization-shell/organization-shell";
import { requireCurrentSession } from "@/lib/auth-session";

interface OrganizationRolesPageProps {
  params: Promise<{ organizationId: string }>;
}

export default async function OrganizationRolesPage({
  params,
}: OrganizationRolesPageProps) {
  await requireCurrentSession();
  const { organizationId } = await params;

  return (
    <OrganizationShell activeSection="roles" organizationId={organizationId}>
      <OrganizationRolesView organizationId={organizationId} />
    </OrganizationShell>
  );
}

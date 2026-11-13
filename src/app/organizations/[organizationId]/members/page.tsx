import { OrganizationMembersView } from "@/components/organization-members/organization-members-view";
import { OrganizationShell } from "@/components/organization-shell/organization-shell";
import { requireCurrentSession } from "@/lib/auth-session";

interface OrganizationMembersPageProps {
  params: Promise<{ organizationId: string }>;
}

export default async function OrganizationMembersPage({
  params,
}: OrganizationMembersPageProps) {
  await requireCurrentSession();
  const { organizationId } = await params;

  return (
    <OrganizationShell activeSection="members" organizationId={organizationId}>
      <OrganizationMembersView organizationId={organizationId} />
    </OrganizationShell>
  );
}

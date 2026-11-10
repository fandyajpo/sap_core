import Link from "next/link";
import { RoleAssignmentsView } from "@/components/role-assignments/role-assignments-view";
import { SignOutButton } from "@/components/sign-out-button";
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
    <main className="app-page">
      <header className="app-header">
        <div className="brand-lockup">
          <span aria-hidden="true" className="brand-mark">SC</span>
          <span className="brand-name">SAP Core</span>
        </div>
        <nav aria-label="Primary navigation">
          <Link href="/">Home</Link>
          <Link href="/account">Account</Link>
        </nav>
        <SignOutButton />
      </header>
      <RoleAssignmentsView organizationId={organizationId} />
    </main>
  );
}

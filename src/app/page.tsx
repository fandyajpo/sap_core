import Link from "next/link";
import { OrganizationOnboarding } from "@/components/organization-onboarding/organization-onboarding";
import { SignOutButton } from "@/components/sign-out-button";
import { requireCurrentSession } from "@/lib/auth-session";
import { getCurrentWorkspace } from "@/lib/organization-workspace-reader";
import styles from "./home.module.css";

export default async function HomePage() {
  const session = await requireCurrentSession();
  const workspace = await getCurrentWorkspace();

  return (
    <main className="app-page">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">SC</span>
          <span className="brand-name">SAP Core</span>
        </div>
        <nav aria-label="Primary navigation">
          <Link href="/account">Account settings</Link>
        </nav>
        <SignOutButton />
      </header>

      {workspace ? (
        <section aria-labelledby="workspace-entry-title" className={styles.entryCard}>
          <p className="eyebrow">Workspace ready</p>
          <h1 id="workspace-entry-title">
            {workspace.organizationName ?? "Organization workspace"}
          </h1>
          <p className={styles.lede}>
            Your account already belongs to an organization. Continue into its workspace to manage
            members, roles and role assignments.
          </p>
          <Link
            className={styles.primaryLink}
            href={`/organizations/${encodeURIComponent(workspace.organizationId)}`}
          >
            Open workspace
            <span aria-hidden="true"> →</span>
          </Link>
          <p className={styles.note}>
            An account holds one active organization membership at a time.
          </p>
        </section>
      ) : (
        <OrganizationOnboarding />
      )}

      <aside className="access-notice">
        <h2>Authentication is not authorization</h2>
        <p>
          A valid sign-in does not grant organization, company, or plant access. Those
          permissions must be resolved from current server-side membership and policy
          records before protected business data is accessed.
        </p>
      </aside>
    </main>
  );
}

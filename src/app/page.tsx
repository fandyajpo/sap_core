import Link from "next/link";
import { OrganizationWorkspaceLink } from "@/components/organization-workspace-link";
import { CreateOrganizationForm } from "@/components/create-organization-form";
import { SignOutButton } from "@/components/sign-out-button";
import { requireCurrentSession } from "@/lib/auth-session";
import styles from "./home.module.css";

export default async function HomePage() {
  const session = await requireCurrentSession();
  const firstName = session.user.name?.trim().split(/\s+/)[0] || "there";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="SAP Core home">
          <span className={styles.brandMark} aria-hidden="true">SC</span>
          <span>SAP Core</span>
        </Link>
        <div className={styles.headerActions}>
          <Link className={styles.accountLink} href="/account">Account settings</Link>
          <SignOutButton />
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.welcome} aria-labelledby="welcome-title">
          <p className={styles.eyebrow}>YOUR WORKSPACE</p>
          <h1 id="welcome-title">Welcome back, {firstName}.</h1>
          <p className={styles.intro}>
            Continue to an organization workspace to review its structure and access.
          </p>
          <div className={styles.identity}>
            <span className={styles.identityDot} aria-hidden="true" />
            <span>{session.user.email}</span>
            <span className={styles.identityDivider} aria-hidden="true" />
            <span>Signed in</span>
          </div>
        </section>

        <section className={styles.entryCard} aria-labelledby="workspace-entry-title">
          <div className={styles.entryHeading}>
            <div>
              <p className={styles.eyebrow}>GET STARTED</p>
              <h2 id="workspace-entry-title">Create your organization</h2>
              <p>Set up your organization and become its initial owner.</p>
            </div>
            <span className={styles.entryMark} aria-hidden="true">↗</span>
          </div>
          <CreateOrganizationForm />
          <div className={styles.existingOrganization}>
            <p>Already have an organization?</p>
            <OrganizationWorkspaceLink />
          </div>
        </section>

        <aside className={styles.securityNote}>
          <span className={styles.securityIcon} aria-hidden="true">i</span>
          <div>
            <h2>Access is checked for every workspace</h2>
            <p>
              Signing in confirms your identity, but does not automatically grant
              organization access. The server verifies your current membership and
              permissions before protected information is shown.
            </p>
          </div>
        </aside>
      </div>
      <footer className={styles.footer}>SAP Core <span>Organization workspace</span></footer>
    </main>
  );
}

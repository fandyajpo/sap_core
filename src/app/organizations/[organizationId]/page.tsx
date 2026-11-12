import Link from "next/link";
import { OrganizationShell } from "@/components/organization-shell/organization-shell";
import { requireCurrentSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { requireTenantPermission } from "@/lib/tenant-authorization";
import styles from "./workspace.module.css";

interface OrganizationWorkspacePageProps {
  params: Promise<{ organizationId: string }>;
}

const sections = [
  {
    title: "Members",
    description: "Review people in this organization and their membership status.",
    href: (id: string) => `/organizations/${id}/members`,
    label: "View members",
    number: "01",
  },
  {
    title: "Roles",
    description: "Inspect organization role definitions, scopes, and permissions.",
    href: (id: string) => `/organizations/${id}/roles`,
    label: "Manage roles",
    number: "02",
  },
  {
    title: "Role assignments",
    description: "Review role grants by member and organizational scope.",
    href: (id: string) => `/organizations/${id}/role-assignments`,
    label: "View assignments",
    number: "03",
  },
];

export default async function OrganizationWorkspacePage({
  params,
}: OrganizationWorkspacePageProps) {
  const session = await requireCurrentSession();
  const { organizationId } = await params;

  await prisma.$transaction(async (tx) => {
    await requireTenantPermission(
      tx,
      session,
      { kind: "ORGANIZATION", organizationId },
      "organization.read",
    );
  });

  const firstName = session.user.name?.trim().split(/\\s+/)[0] || "there";

  return (
    <OrganizationShell activeSection="overview" organizationId={organizationId}>
      <div className={styles.page}>
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>ORGANIZATION WORKSPACE</p>
            <h1>Good to see you, {firstName}.</h1>
            <p className={styles.subtitle}>Your organization access and administration, in one place.</p>
          </div>
          <span className={styles.status}><span /> Secure workspace</span>
        </div>

        <section className={styles.contextCard} aria-label="Current organization">
          <div>
            <span className={styles.contextLabel}>CURRENT ORGANIZATION</span>
            <code>{organizationId}</code>
          </div>
          <span className={styles.contextNote}>Organization context is verified by the server on each protected request.</span>
        </section>

        <div className={styles.sectionHeading}>
          <div>
            <h2>Workspace</h2>
            <p>Choose an area to continue.</p>
          </div>
          <span>03 AREAS</span>
        </div>

        <div className={styles.cards}>
          {sections.map((section) => (
            <article className={styles.card} key={section.number}>
              <span className={styles.cardNumber}>{section.number}</span>
              <div>
                <h3>{section.title}</h3>
                <p>{section.description}</p>
              </div>
              <Link href={section.href(organizationId)}>{section.label}<span aria-hidden="true"> ↗</span></Link>
            </article>
          ))}
        </div>

        <footer className={styles.footer}>
          <span>Signed in as {session.user.email}</span>
          <Link href="/account">Manage account</Link>
        </footer>
      </div>
    </OrganizationShell>
  );
}

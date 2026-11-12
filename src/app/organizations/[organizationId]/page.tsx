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
    description: "Review the people who belong to this organization and their membership status.",
    detail: "PEOPLE & MEMBERSHIP",
    href: (id: string) => `/organizations/${id}/members`,
    label: "Explore members",
    number: "01",
  },
  {
    title: "Roles",
    description: "Understand the role definitions available within this organization.",
    detail: "ACCESS STRUCTURE",
    href: (id: string) => `/organizations/${id}/roles`,
    label: "Explore roles",
    number: "02",
  },
  {
    title: "Role assignments",
    description: "Review which roles have been granted and to whom they apply.",
    detail: "PERMISSIONS & SCOPE",
    href: (id: string) => `/organizations/${id}/role-assignments`,
    label: "Explore assignments",
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

  const firstName = session.user.name?.trim().split(/\s+/)[0] || "there";

  return (
    <OrganizationShell activeSection="overview" organizationId={organizationId}>
      <div className={styles.page}>
        <header className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>ORGANIZATION WORKSPACE</p>
            <h1>Welcome back, {firstName}.</h1>
            <p className={styles.subtitle}>
              A central place to review your organization structure and access.
            </p>
          </div>
          <span className={styles.status}>
            <span className={styles.statusDot} aria-hidden="true" />
            Protected workspace
          </span>
        </header>

        <section className={styles.contextCard} aria-labelledby="organization-context-title">
          <div className={styles.contextTopline}>
            <span className={styles.contextLabel} id="organization-context-title">ACTIVE ORGANIZATION</span>
            <span className={styles.contextBadge}>SERVER VERIFIED</span>
          </div>
          <code className={styles.organizationId}>{organizationId}</code>
          <p className={styles.contextNote}>
            This workspace is opened using your organization identifier. Access to protected
            areas is checked by the server for each request.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="workspace-areas-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>WORKSPACE DIRECTORY</p>
              <h2 id="workspace-areas-title">Explore your workspace</h2>
              <p>Choose an area to review organization structure and access.</p>
            </div>
            <span className={styles.sectionCount}>03 AREAS</span>
          </div>

          <div className={styles.cards}>
            {sections.map((section) => (
              <article className={styles.card} key={section.number}>
                <div className={styles.cardTopline}>
                  <span className={styles.cardNumber}>{section.number}</span>
                  <span className={styles.cardDetail}>{section.detail}</span>
                </div>
                <div className={styles.cardBody}>
                  <h3>{section.title}</h3>
                  <p>{section.description}</p>
                </div>
                <Link className={styles.cardLink} href={section.href(organizationId)}>
                  {section.label}<span aria-hidden="true">↗</span>
                </Link>
              </article>
            ))}
          </div>
        </section>

        <footer className={styles.footer}>
          <span>Signed in as {session.user.email}</span>
          <Link href="/account">Manage account <span aria-hidden="true">↗</span></Link>
        </footer>
      </div>
    </OrganizationShell>
  );
}

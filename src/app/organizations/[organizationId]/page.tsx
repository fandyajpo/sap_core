import Link from "next/link";
import { OrganizationWorkspaceIcon } from "@/components/organization-shell/icons";
import { OrganizationShell } from "@/components/organization-shell/organization-shell";
import { requireCurrentSession } from "@/lib/auth-session";
import { getCurrentWorkspace } from "@/lib/organization-workspace-reader";
import styles from "./workspace.module.css";

interface OrganizationWorkspacePageProps {
  params: Promise<{ organizationId: string }>;
}

export default async function OrganizationWorkspacePage({
  params,
}: OrganizationWorkspacePageProps) {
  const session = await requireCurrentSession();
  const { organizationId } = await params;
  const base = `/organizations/${encodeURIComponent(organizationId)}`;
  // Only show a display name when this workspace is the caller's own current
  // workspace; another tenant's name must never be rendered here.
  const currentWorkspace = await getCurrentWorkspace();
  const organizationName = currentWorkspace?.organizationId === organizationId
    ? currentWorkspace.organizationName
    : null;

  const areas = [
    {
      action: "View members",
      description: "Review the people who currently hold an active membership in this organization.",
      href: `${base}/members`,
      icon: "members" as const,
      title: "Members",
    },
    {
      action: "View roles",
      description: "Inspect the system roles and this organization's own custom role definitions.",
      href: `${base}/roles`,
      icon: "roles" as const,
      title: "Roles",
    },
    {
      action: "View assignments",
      description: "Review scoped grants against an organization, company or plant target.",
      href: `${base}/role-assignments`,
      icon: "assignments" as const,
      title: "Role assignments",
    },
  ];

  return (
    <OrganizationShell
      account={{ email: session.user.email, name: session.user.name }}
      organizationId={organizationId}
    >
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <p className="eyebrow">Organization workspace</p>
          <div className={styles.titleRow}>
            <h1>Workspace overview</h1>
            <span className={styles.statusBadge}>
              <span aria-hidden="true" className={styles.statusDot} />
              Secure workspace
            </span>
          </div>
          <p className={styles.lede}>
            Welcome back, {session.user.name}. This workspace is scoped to the organization your
            session is currently authorized to access.
          </p>
        </header>

        <section aria-labelledby="workspace-context-title" className={styles.contextPanel}>
          <div className={styles.contextIdentity}>
            <p className={styles.contextLabel}>Current organization</p>
            <h2 id="workspace-context-title">
              {organizationName ?? "Organization workspace"}
            </h2>
            <p className={styles.contextHint}>
              {organizationName
                ? "You are working inside this organization's tenant scope. Every request is authorized against your current membership."
                : "A display name is not available for this organization, so the workspace is identified by a neutral label and its internal reference."}
            </p>
            <p className={styles.contextId}>
              Organization ID <code>{organizationId}</code>
            </p>
          </div>
          <dl className={styles.contextMeta}>
            <div>
              <dt>Access</dt>
              <dd>Server-verified session</dd>
            </div>
            <div>
              <dt>Scope</dt>
              <dd>Organization</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="workspace-areas-title" className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 id="workspace-areas-title">Workspace areas</h2>
            <p>Administrative surfaces available inside this organization.</p>
          </div>
          <ul className={styles.cardGrid}>
            {areas.map((area) => (
              <li key={area.href}>
                <Link className={styles.card} href={area.href}>
                  <span className={styles.cardIcon}>
                    <OrganizationWorkspaceIcon name={area.icon} size={22} />
                  </span>
                  <span className={styles.cardBody}>
                    <span className={styles.cardTitle}>{area.title}</span>
                    <span className={styles.cardDescription}>{area.description}</span>
                    <span className={styles.cardAction}>
                      {area.action}
                      <span aria-hidden="true"> →</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="workspace-access-title" className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 id="workspace-access-title">Access and security</h2>
            <p>How this workspace protects tenant data.</p>
          </div>
          <ul className={styles.accessList}>
            <li>Every request revalidates your session and organization membership on the server.</li>
            <li>Members, roles and assignments are read from live tenant records, not client state.</li>
            <li>Signing out ends this session; protected data is never rendered without it.</li>
          </ul>
        </section>
      </div>
    </OrganizationShell>
  );
}

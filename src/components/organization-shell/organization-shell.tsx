import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import styles from "./organization-shell.module.css";

type OrganizationSection = "overview" | "members" | "roles" | "assignments";

interface OrganizationShellProps {
  organizationId: string;
  activeSection: OrganizationSection;
  children: ReactNode;
}

const navigation: {
  key: OrganizationSection;
  label: string;
  href: (id: string) => string;
  description: string;
}[] = [
  { key: "overview", label: "Overview", href: (id) => `/organizations/${id}`, description: "Workspace summary" },
  { key: "members", label: "Members", href: (id) => `/organizations/${id}/members`, description: "People and membership" },
  { key: "roles", label: "Roles", href: (id) => `/organizations/${id}/roles`, description: "Role definitions" },
  { key: "assignments", label: "Role assignments", href: (id) => `/organizations/${id}/role-assignments`, description: "Member access grants" },
];

export function OrganizationShell({
  organizationId,
  activeSection,
  children,
}: OrganizationShellProps) {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#workspace-main">Skip to workspace content</a>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/" aria-label="SAP Core home">
          <span className={styles.brandMark} aria-hidden="true">SC</span>
          <span>SAP Core</span>
        </Link>
        <div className={styles.workspaceContext}>
          <span className={styles.contextCaption}>CURRENT WORKSPACE</span>
          <span className={styles.contextValue} title={organizationId}>{organizationId}</span>
        </div>
        <div className={styles.topbarActions}>
          <Link className={styles.accountLink} href="/account">Account</Link>
          <SignOutButton />
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.sidebar} aria-label="Workspace sidebar">
          <div className={styles.sidebarHeading}>
            <span className={styles.sidebarLabel}>ORGANIZATION</span>
            <span className={styles.organizationId} title={organizationId}>{organizationId}</span>
          </div>
          <nav className={styles.navigation} aria-label="Organization navigation">
            {navigation.map((item) => {
              const isActive = activeSection === item.key;
              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={isActive ? styles.navLinkActive : styles.navLink}
                  href={item.href(organizationId)}
                  key={item.key}
                  title={item.description}
                >
                  <span className={styles.navIndicator} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className={styles.sidebarFooter}>
            <span className={styles.securityDot} aria-hidden="true" />
            <span>Access is verified on every protected request.</span>
          </div>
        </aside>

        <main className={styles.main} id="workspace-main" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}

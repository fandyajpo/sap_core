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

const navigation: { key: OrganizationSection; label: string; href: (id: string) => string }[] = [
  { key: "overview", label: "Overview", href: (id) => `/organizations/${id}` },
  { key: "members", label: "Members", href: (id) => `/organizations/${id}/members` },
  { key: "roles", label: "Roles", href: (id) => `/organizations/${id}/roles` },
  { key: "assignments", label: "Role assignments", href: (id) => `/organizations/${id}/role-assignments` },
];

export function OrganizationShell({
  organizationId,
  activeSection,
  children,
}: OrganizationShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/" aria-label="SAP Core home">
          <span className={styles.brandMark}>SC</span>
          <span>SAP Core</span>
        </Link>
        <div className={styles.topbarActions}>
          <Link className={styles.accountLink} href="/account">Account</Link>
          <SignOutButton />
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.sidebar} aria-label="Organization navigation">
          <div className={styles.sidebarHeading}>
            <span className={styles.sidebarLabel}>WORKSPACE</span>
            <span className={styles.organizationId}>{organizationId}</span>
          </div>
          <nav className={styles.navigation}>
            {navigation.map((item) => (
              <Link
                aria-current={activeSection === item.key ? "page" : undefined}
                className={activeSection === item.key ? styles.navLinkActive : styles.navLink}
                href={item.href(organizationId)}
                key={item.key}
              >
                <span className={styles.navIndicator} aria-hidden="true" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className={styles.sidebarFooter}>
            <span className={styles.securityDot} aria-hidden="true" />
            <span>Access is verified per request</span>
          </div>
        </aside>

        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}

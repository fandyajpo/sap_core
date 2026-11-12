"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { OrganizationWorkspaceIcon, type WorkspaceIconName } from "./icons";
import styles from "./organization-shell.module.css";

interface NavigationItem {
  href: string;
  label: string;
  description: string;
  icon: WorkspaceIconName;
}

export interface OrganizationShellProps {
  /** Display identity from the server-resolved session; never client state. */
  account: { name: string; email: string };
  children: ReactNode;
  organizationId: string;
}

function navigationFor(organizationId: string): NavigationItem[] {
  const base = `/organizations/${encodeURIComponent(organizationId)}`;
  return [
    { href: base, label: "Overview", description: "Workspace summary", icon: "overview" },
    { href: `${base}/members`, label: "Members", description: "People with access", icon: "members" },
    { href: `${base}/roles`, description: "Role catalogue", icon: "roles", label: "Roles" },
    { href: `${base}/role-assignments`, description: "Scoped grants", icon: "assignments", label: "Role assignments" },
  ];
}

function initialsFor(name: string, email: string): string {
  const source = name.trim() || email.trim();
  if (!source) return "SC";
  const initials = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return initials || "SC";
}

export function OrganizationShell({
  account,
  children,
  organizationId,
}: OrganizationShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = navigationFor(organizationId);
  const current =
    [...items]
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((left, right) => right.href.length - left.href.length)[0] ?? items[0];
  const baseHref = items[0].href;
  const initials = initialsFor(account.name, account.email);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#organization-content">
        Skip to content
      </a>

      {mobileOpen ? (
        <button
          aria-label="Close navigation"
          className={styles.scrim}
          onClick={() => setMobileOpen(false)}
          type="button"
        />
      ) : null}

      <aside
        className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}
        id="organization-sidebar"
      >
        <div className={styles.brand}>
          <span aria-hidden="true" className={styles.brandMark}>SC</span>
          <span className={styles.brandText}>
            <span className={styles.brandName}>SAP Core</span>
            <span className={styles.brandTagline}>Enterprise workspace</span>
          </span>
        </div>

        <div className={styles.workspace}>
          <span className={styles.workspaceLabel}>Organization</span>
          <span className={styles.workspaceName}>Organization workspace</span>
        </div>

        <nav aria-label="Organization" className={styles.navigation}>
          <ul className={styles.navigationList}>
            {items.map((item) => {
              const isActive = item.href === current.href;
              return (
                <li key={item.href}>
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={`${styles.navigationLink} ${isActive ? styles.navigationLinkActive : ""}`}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    title={item.label}
                  >
                    <span className={styles.navigationIcon}>
                      <OrganizationWorkspaceIcon name={item.icon} />
                    </span>
                    <span className={styles.navigationText}>
                      <span className={styles.navigationLabel}>{item.label}</span>
                      <span className={styles.navigationDescription}>{item.description}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.account}>
            <span aria-hidden="true" className={styles.accountAvatar}>{initials}</span>
            <span className={styles.accountText}>
              <span className={styles.accountName}>{account.name}</span>
              <span className={styles.accountEmail}>{account.email}</span>
            </span>
          </div>
          <p className={styles.sidebarNote}>
            Access is verified on the server for every request.
          </p>
          <Link className={styles.sidebarLink} href="/account">
            Account settings
          </Link>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <button
            aria-controls="organization-sidebar"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            className={styles.menuButton}
            onClick={() => setMobileOpen((open) => !open)}
            type="button"
          >
            <span aria-hidden="true" className={styles.menuBar} />
            <span aria-hidden="true" className={styles.menuBar} />
            <span aria-hidden="true" className={styles.menuBar} />
          </button>

          <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
            <ol className={styles.breadcrumbList}>
              <li>
                <Link href="/">SAP Core</Link>
              </li>
              <li aria-hidden="true" className={styles.breadcrumbSeparator}>/</li>
              <li>
                <Link
                  aria-current={current.href === baseHref ? "page" : undefined}
                  href={baseHref}
                >
                  Workspace
                </Link>
              </li>
              {current.href === baseHref ? null : (
                <>
                  <li aria-hidden="true" className={styles.breadcrumbSeparator}>/</li>
                  <li>
                    <span aria-current="page">{current.label}</span>
                  </li>
                </>
              )}
            </ul>
          </nav>

          <div className={styles.topbarActions}>
            <Link className={styles.accountLink} href="/account">
              <span aria-hidden="true" className={styles.accountAvatarSmall}>{initials}</span>
              <span className={styles.accountLinkText}>{account.name}</span>
            </Link>
            <SignOutButton />
          </div>
        </header>

        <main className={styles.content} id="organization-content">
          {children}
        </main>
      </div>
    </div>
  );
}

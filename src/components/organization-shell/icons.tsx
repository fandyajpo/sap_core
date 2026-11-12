/**
 * Workspace iconography.
 *
 * The project pins no icon dependency, so these are small inline SVGs rather
 * than a new package. They are decorative by default: callers either wrap them
 * in a labelled control or mark them aria-hidden. No client directive is
 * needed — the module is plain markup and is safe to import from server and
 * client components alike.
 */

export type WorkspaceIconName = "overview" | "members" | "roles" | "assignments";

export function OrganizationWorkspaceIcon({
  name,
  size = 20,
}: {
  name: WorkspaceIconName;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      viewBox="0 0 24 24"
      width={size}
    >
      {name === "overview" ? (
        <>
          <rect height="7" rx="1.5" width="7" x="3" y="3" />
          <rect height="7" rx="1.5" width="7" x="14" y="3" />
          <rect height="7" rx="1.5" width="7" x="3" y="14" />
          <rect height="7" rx="1.5" width="7" x="14" y="14" />
        </>
      ) : null}

      {name === "members" ? (
        <>
          <circle cx="9" cy="8" r="3.25" />
          <path d="M3.4 19.2c.55-3.1 2.85-4.85 5.6-4.85s5.05 1.75 5.6 4.85" />
          <path d="M15.9 5.2a3.1 3.1 0 0 1 0 5.7" />
          <path d="M17.6 14.7c1.9.5 3.05 2 3.4 4.3" />
        </>
      ) : null}

      {name === "roles" ? (
        <>
          <path d="M12 3.2 19 6v5.4c0 4.2-2.95 7.4-7 8.4-4.05-1-7-4.2-7-8.4V6z" />
          <path d="m9.2 11.9 2.05 2.05 3.75-3.75" />
        </>
      ) : null}

      {name === "assignments" ? (
        <>
          <circle cx="8.5" cy="15.5" r="3.5" />
          <path d="M10.9 13.1 18 6" />
          <path d="M15.4 4.5 19.5 8.6" />
          <path d="M17 7.1 19 5.1" />
        </>
      ) : null}
    </svg>
  );
}

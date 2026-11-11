import Link from "next/link";
import { UiShowcaseView } from "@/components/ui-showcase/ui-showcase-view";
import { SignOutButton } from "@/components/sign-out-button";
import { simulateDelayedSuccess } from "@/components/ui-showcase/simulations";
import { requireCurrentSession } from "@/lib/auth-session";

export default async function UiShowcasePage() {
  await requireCurrentSession();

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
        {/* Simulated on purpose: the showcase header must not end the
            reviewer's real session. */}
        <SignOutButton
          label="Sign out (simulated)"
          onSignOut={() => simulateDelayedSuccess(600)}
        />
      </header>
      <UiShowcaseView organizationId="showcase" />
    </main>
  );
}

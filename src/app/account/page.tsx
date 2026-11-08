import Link from "next/link";
import { ProfileNameForm } from "@/components/profile-name-form";
import { SignOutButton } from "@/components/sign-out-button";
import { requireCurrentSession } from "@/lib/auth-session";

export default async function AccountPage() {
  const session = await requireCurrentSession();

  return (
    <main className="app-page">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">SC</span>
          <span className="brand-name">SAP Core</span>
        </div>
        <nav aria-label="Primary navigation">
          <Link href="/">Home</Link>
        </nav>
        <SignOutButton />
      </header>

      <section className="welcome-card" aria-labelledby="account-title">
        <p className="eyebrow">Account profile</p>
        <h1 id="account-title">Your account</h1>
        <p className="user-email">{session.user.email}</p>
        <p className="user-email">
          Email address: {session.user.emailVerified ? "verified" : "not verified"}
        </p>
        <ProfileNameForm initialName={session.user.name} />
      </section>

      <aside className="access-notice">
        <h2>Authentication is not authorization</h2>
        <p>
          This profile confirms your identity only. Organization, company, plant, and role
          access must be resolved separately from current server-side membership and policy
          records.
        </p>
      </aside>
    </main>
  );
}

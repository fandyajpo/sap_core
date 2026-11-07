import { SignOutButton } from "@/components/sign-out-button";
import { requireCurrentSession } from "@/lib/auth-session";

export default async function HomePage() {
  const session = await requireCurrentSession();

  return (
    <main className="app-page">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">SC</span>
          <span className="brand-name">SAP Core</span>
        </div>
        <SignOutButton />
      </header>

      <section className="welcome-card" aria-labelledby="welcome-title">
        <p className="eyebrow">Authenticated session</p>
        <h1 id="welcome-title">Welcome, {session.user.name}</h1>
        <p className="user-email">{session.user.email}</p>
        <div className="status-row">
          <span className="status-dot" aria-hidden="true" />
          <span>Your identity has been verified for this session.</span>
        </div>
      </section>

      <aside className="access-notice">
        <h2>Authentication is not authorization</h2>
        <p>
          A valid sign-in does not grant organization, company, or plant access. Those
          permissions must be resolved from current server-side membership and policy
          records before protected business data is accessed.
        </p>
      </aside>
    </main>
  );
}

"use client";

import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { simulateDelayedSuccess } from "./simulations";

export function UiShowcaseHeader() {
  return (
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
          reviewer's real session. The callback lives inside this Client
          Component so no function props cross the Server Component
          boundary. */}
      <SignOutButton
        label="Sign out (simulated)"
        onSignOut={() => simulateDelayedSuccess(600)}
      />
    </header>
  );
}

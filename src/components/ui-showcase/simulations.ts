/*
 * Showcase-only simulators. These never touch Better Auth, the real
 * session, or any production API — they exist so the UI Showcase can
 * demonstrate real component behavior (loading, disabled, success
 * states) without mutating the authenticated user's account.
 */

export interface SimulatedResult {
  error: string | null;
}

/** Resolves with a simulated success after the given delay. */
export function simulateDelayedSuccess(ms = 600): Promise<SimulatedResult> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve({ error: null }), ms);
  });
}

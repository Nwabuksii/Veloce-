// Keeps "does this account exist?" from showing up in how long a response
// takes. Auth routes that must answer the same way for known and unknown
// emails call this before responding, so the fast path (nothing to do) and
// the slow path (database write + email send) take about the same time.

export const AUTH_MIN_RESPONSE_MS = 1500;

/** Waits until at least `minMs` have passed since `startedAt` (a Date.now() value). */
export async function padToMinimum(startedAt: number, minMs: number): Promise<void> {
  const remaining = minMs - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

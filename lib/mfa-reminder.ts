// The red "turn on two-step verification" bar for admins (see
// app/components/MfaReminder.tsx). Closing it with the X remembers that
// here; signing in again forgets it, so it comes back every login.

const KEY = "veloce_mfa_reminder_dismissed";

export function isMfaReminderDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissMfaReminder(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {}
}

export function resetMfaReminder(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

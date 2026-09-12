// Client-side helper for the logged-in user's basic info.
//
// The actual auth token now lives in an httpOnly cookie set by the server
// (see lib/auth.ts / the login+signup routes) — client-side JS can't read
// it, which is the whole point (an XSS bug can no longer steal a session).
// Browsers attach that cookie automatically on same-origin fetch() calls,
// so pages don't need to manually pass a token anymore.
//
// What we DO still keep in localStorage is non-sensitive display info
// (name/email/role) purely so the UI can render instantly without an extra
// round trip — it is never treated as proof of identity. Every real access
// decision still happens server-side via requireRole() on each request.

export interface StoredUser {
  id: string;
  email: string;
  fullName: string;
  role: "STUDENT" | "SCRIBE" | "ADMIN";
  theme?: "light" | "dark";
}

const USER_KEY = "veloce_user";

export function saveUser(user: StoredUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser(): StoredUser | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function clearSession() {
  // Clears the httpOnly cookie server-side — client JS has no other way to remove it.
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // best-effort; still clear local display info below regardless
  }
  localStorage.removeItem(USER_KEY);
}

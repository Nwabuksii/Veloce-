import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;
const TOKEN_EXPIRY = "7d";
const TOKEN_EXPIRY_SECONDS = 60 * 60 * 24 * 7;

export type UserRole = "STUDENT" | "SCRIBE" | "ADMIN";

export interface TokenPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
  universityId: string;
}

// ── Session cookie ────────────────────────────────────────────
// The JWT lives in an httpOnly cookie so client-side JS (and anything an
// XSS bug might inject) can never read it — a real fix over the earlier
// localStorage approach, not just a relocation of the same risk.

export const SESSION_COOKIE = "veloce_session";

export function sessionCookieOptions(maxAgeSeconds: number = TOKEN_EXPIRY_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

// ── Passwords ──────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ── Tokens ──────────────────────────────────────────────────
// Issued fresh on every login, so a role change (e.g. Student -> Scribe)
// only takes effect once the user logs in again with their updated role.

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null; // expired or tampered
  }
}

// ── Role hierarchy: Admin > Scribe > Student ─────────────────
// A role "has access" to anything at or below its own level.

const ROLE_RANK: Record<UserRole, number> = {
  STUDENT: 0,
  SCRIBE: 1,
  ADMIN: 2,
};

export function hasRole(userRole: UserRole, required: UserRole): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[required];
}

import { NextRequest, NextResponse } from "next/server";
import { verifyToken, hasRole, UserRole, TokenPayload, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAndResolveBan } from "@/lib/ban";
import { formatDateDDMMYYYY } from "@/lib/date-format";
import { NO_STORE } from "@/lib/cache-policy";

/**
 * Pulls the CLAIMS out of the session token. This only proves the token was
 * signed by us — it does NOT check the ban list, the session version or the
 * user's current role. Route handlers must go through requireRole, which does.
 *
 * Pulls the user out of the session — the httpOnly cookie first (how the
 * real app authenticates), falling back to an Authorization header (kept
 * so Postman/curl testing against the API directly still works).
 */
export function getSessionUser(req: NextRequest): TokenPayload | null {
  const cookieToken = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookieToken) return verifyToken(cookieToken);

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return verifyToken(authHeader.slice("Bearer ".length));
  }

  return null;
}

/**
 * Wrap an API route handler with a minimum-role requirement.
 * Admin > Scribe > Student, so requireRole("SCRIBE") also allows Admins through.
 *
 * Works for both static routes and dynamic ones (e.g. app/api/x/[id]/route.ts) —
 * Next.js calls route handlers as (req, context), and context.params holds
 * dynamic segments like { id: string }. We forward that through untouched.
 *
 * Usage (static route):
 *   export const POST = requireRole("SCRIBE", async (req, user) => { ... });
 *
 * Usage (dynamic route, e.g. [id]/approve/route.ts):
 *   export const POST = requireRole("ADMIN", async (req, user, ctx) => {
 *     const id = ctx.params.id;
 *     ...
 *   });
 */
export function requireRole<Ctx = unknown>(
  minRole: UserRole,
  handler: (req: NextRequest, user: TokenPayload, ctx: Ctx) => Promise<NextResponse>
) {
  return async (req: NextRequest, ctx: Ctx): Promise<NextResponse> => {
    const claims = getSessionUser(req);

    if (!claims) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // One query does three jobs: marks the user as recently active (so the
    // admin dashboard can tell a live user from one who logged in days ago),
    // proves the account still exists, and returns the CURRENT role and
    // session version — the token's own copies of those are only a snapshot
    // from login time and are never trusted for authorization.
    let dbUser: { role: UserRole; universityId: string; sessionVersion: number };
    try {
      dbUser = await prisma.user.update({
        where: { id: claims.sub },
        data: { lastSeenAt: new Date() },
        select: { role: true, universityId: true, sessionVersion: true },
      });
    } catch (err: any) {
      if (err?.code === "P2025") {
        // Account was deleted after this token was issued.
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
      throw err;
    }

    // Checked on every authenticated request, not just at login — a ban
    // needs to cut off an already-issued session immediately, not merely
    // block the next fresh login while a still-valid 7-day token keeps
    // working underneath it. Checked before the session-version and role
    // checks so a banned user always sees the ban message, never a generic
    // "session expired" or permissions error.
    const banStatus = await checkAndResolveBan(claims.sub);
    if (banStatus.banned) {
      const untilText = banStatus.until ? `until ${formatDateDDMMYYYY(banStatus.until)}` : "until further notice";
      return NextResponse.json(
        { error: `Your account is suspended ${untilText}.`, banned: true },
        { status: 403 }
      );
    }

    // A password change/reset, demotion or ban bumps User.sessionVersion;
    // any token issued before that no longer matches and must log in again.
    if ((claims.sv ?? 0) !== dbUser.sessionVersion) {
      return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
    }

    // From here on the handler sees the role/university as they are NOW in
    // the database, not what the token said when it was issued.
    const user: TokenPayload = { ...claims, role: dbUser.role, universityId: dbUser.universityId };

    if (!hasRole(user.role, minRole)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Everything behind a login is personal, so by default nothing is
    // cacheable. A route that sets its own Cache-Control keeps it.
    const response = await handler(req, user, ctx);
    if (!response.headers.has("Cache-Control")) response.headers.set("Cache-Control", NO_STORE);
    return response;
  };
}

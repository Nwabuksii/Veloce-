import { NextRequest, NextResponse } from "next/server";
import { verifyToken, hasRole, UserRole, TokenPayload, SESSION_COOKIE } from "@/lib/auth";

/**
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
    const user = getSessionUser(req);

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!hasRole(user.role, minRole)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    return handler(req, user, ctx);
  };
}

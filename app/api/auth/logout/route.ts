import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

// httpOnly cookies can't be cleared by client-side JS — this is the only
// way to actually log someone out now that the token isn't in localStorage.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  return res;
}

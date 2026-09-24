import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Unauthenticated — for Vercel/an uptime monitor to ping, not for the app
// itself. Deliberately does the cheapest possible real DB round-trip
// (SELECT 1) rather than just returning 200 unconditionally, so a broken
// DATABASE_URL or an exhausted connection pool shows up here instead of
// only surfacing as scattered 500s across real routes.
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      db: "ok",
      latencyMs: Date.now() - startedAt,
      time: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Health check DB ping failed:", err);
    return NextResponse.json(
      { status: "error", db: "unreachable", time: new Date().toISOString() },
      { status: 503 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { runLeaderboardSnapshot } from "@/lib/leaderboard-snapshot";

// Rebuilds the leaderboard snapshots right now, ignoring the once-a-day
// freshness check. Handy right after setting up, or when checking a change.
export const POST = requireRole("ADMIN", async (_req: NextRequest) => {
  try {
    const result = await runLeaderboardSnapshot({ force: true });
    return NextResponse.json(result, { status: result.ran ? 200 : 409 });
  } catch (err) {
    console.error("leaderboard refresh failed", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Could not refresh the leaderboard." }, { status: 500 });
  }
});

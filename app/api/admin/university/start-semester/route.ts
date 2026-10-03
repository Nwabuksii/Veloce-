import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { runLeaderboardSnapshot } from "@/lib/leaderboard-snapshot";
import { awardSemesterBadges } from "@/lib/badge-awards";

// "26/27" — two-digit years, the second exactly one more than the first.
function isValidAcademicYear(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{2}\/\d{2}$/.test(value)) return false;
  const [a, b] = value.split("/").map(Number);
  return (a + 1) % 100 === b;
}

function nextAcademicYear(value: string): string {
  const a = (Number(value.split("/")[0]) + 1) % 100;
  const b = (a + 1) % 100;
  return `${String(a).padStart(2, "0")}/${String(b).padStart(2, "0")}`;
}

// Semester 1 -> semester 2 of the same year; semester 2 -> semester 1 of the next.
function nextAfter(current: { academicYear: string; number: number }) {
  return current.number === 1
    ? { academicYear: current.academicYear, number: 2 }
    : { academicYear: nextAcademicYear(current.academicYear), number: 1 };
}

// Blocks an accidental double-click / double-run.
const MIN_DAYS_BETWEEN_STARTS = 7;

// No side effects — lets the admin panel show the current semester and what
// "Start new semester" is about to create.
export const GET = requireRole("ADMIN", async (_req: NextRequest, adminUser) => {
  const current = await prisma.semester.findFirst({
    where: { universityId: adminUser.universityId, endsAt: null },
    orderBy: { startsAt: "desc" },
  });

  const lockedUntil = current
    ? new Date(current.startsAt.getTime() + MIN_DAYS_BETWEEN_STARTS * 86_400_000)
    : null;
  const locked = Boolean(lockedUntil && lockedUntil > new Date());

  return NextResponse.json({
    current: current
      ? { academicYear: current.academicYear, number: current.number, startsAt: current.startsAt }
      : null,
    next: current ? nextAfter(current) : null, // null = first ever: admin chooses
    locked,
    lockedUntil: locked ? lockedUntil : null,
  });
});

export const POST = requireRole("ADMIN", async (req: NextRequest, adminUser) => {
  const body = await req.json().catch(() => ({}));
  const now = new Date();

  const current = await prisma.semester.findFirst({
    where: { universityId: adminUser.universityId, endsAt: null },
    orderBy: { startsAt: "desc" },
  });

  let target: { academicYear: string; number: number };
  if (current) {
    const lockedUntil = new Date(current.startsAt.getTime() + MIN_DAYS_BETWEEN_STARTS * 86_400_000);
    if (lockedUntil > now) {
      return NextResponse.json(
        { error: "A semester was started recently. Try again after " + lockedUntil.toLocaleDateString() + "." },
        { status: 409 }
      );
    }
    target = nextAfter(current);
  } else {
    // First semester ever for this university — the admin names it.
    if (!isValidAcademicYear(body.academicYear) || (body.number !== 1 && body.number !== 2)) {
      return NextResponse.json(
        { error: "Enter the academic year as 26/27 and choose semester 1 or 2." },
        { status: 400 }
      );
    }
    target = { academicYear: body.academicYear, number: body.number };
  }

  // The semester that is closing gets one last leaderboard snapshot BEFORE it
  // is closed, so its badges are awarded from final numbers. If that can't
  // run, nothing is closed and the admin can simply try again.
  if (current) {
    try {
      const last = await runLeaderboardSnapshot({ force: true });
      if (!last.ran) {
        return NextResponse.json(
          { error: "The leaderboard is being refreshed right now. Try again in a minute." },
          { status: 409 }
        );
      }
    } catch (err) {
      console.error("final semester snapshot failed", err instanceof Error ? err.message : "unknown");
      return NextResponse.json({ error: "Could not finalise the leaderboard. Nothing was changed." }, { status: 500 });
    }
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (current) {
        await tx.semester.update({ where: { id: current.id }, data: { endsAt: now } });
      }
      return tx.semester.create({
        data: { universityId: adminUser.universityId, ...target, startsAt: now },
      });
    });

    // Award badges for the semester that just closed (its snapshot is now
    // frozen), then build the new semester's first snapshot. Both are safe to
    // repeat; a failure here must not undo the semester change.
    let badgesAwarded: number | null = null;
    if (current) {
      try {
        badgesAwarded = await awardSemesterBadges(adminUser.universityId, current.academicYear, current.number);
      } catch (err) {
        console.error("semester badge award failed", err instanceof Error ? err.message : "unknown");
      }
    }
    // Always build the new semester's board, including the very first semester
    // (there is no closing semester then), so it is not empty until tomorrow.
    try {
      await runLeaderboardSnapshot({ force: true });
    } catch (err) {
      console.error("new semester snapshot failed", err instanceof Error ? err.message : "unknown");
    }
    return NextResponse.json({ academicYear: created.academicYear, number: created.number, badgesAwarded });
  } catch {
    // Unique (university, year, number) hit — that semester already exists.
    return NextResponse.json({ error: "That semester already exists." }, { status: 409 });
  }
});

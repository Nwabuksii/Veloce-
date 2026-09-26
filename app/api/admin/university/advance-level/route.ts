import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { LEVELS } from "@/lib/academic";

// Only ever runnable in May or July — covers both semester-calendar
// patterns Nigerian universities run on. Which month actually matches a
// given school's own session end is that school's admin's call, made
// when the time comes — not something pre-configured per university.
const ADVANCE_MONTHS = [4, 6]; // Date#getMonth() is 0-indexed: May=4, July=6

function isLockedForThisWindow(lastLevelAdvanceAt: Date | null, now: Date): boolean {
  return Boolean(
    lastLevelAdvanceAt &&
      lastLevelAdvanceAt.getMonth() === now.getMonth() &&
      lastLevelAdvanceAt.getFullYear() === now.getFullYear()
  );
}

// So the admin panel can show "available now" / "locked until July" /
// "not in May or July" without guessing — no side effects.
export const GET = requireRole("ADMIN", async (req: NextRequest, adminUser) => {
  const now = new Date();
  const university = await prisma.university.findUnique({ where: { id: adminUser.universityId } });

  const inWindow = ADVANCE_MONTHS.includes(now.getMonth());
  const locked = isLockedForThisWindow(university?.lastLevelAdvanceAt ?? null, now);

  return NextResponse.json({
    eligibleNow: inWindow && !locked,
    inWindow,
    lockedForThisWindow: locked,
    lastLevelAdvanceAt: university?.lastLevelAdvanceAt ?? null,
  });
});

export const POST = requireRole("ADMIN", async (req: NextRequest, adminUser) => {
  const now = new Date();

  if (!ADVANCE_MONTHS.includes(now.getMonth())) {
    return NextResponse.json(
      { error: "Level advances can only be started in May or July." },
      { status: 403 }
    );
  }

  const university = await prisma.university.findUnique({ where: { id: adminUser.universityId } });
  if (!university) {
    return NextResponse.json({ error: "University not found" }, { status: 404 });
  }

  // Locked for the rest of THIS window once used — re-eligible the next
  // time the month is May or July again (next window, or next year).
  if (isLockedForThisWindow(university.lastLevelAdvanceAt, now)) {
    return NextResponse.json(
      { error: "A level advance has already been started for this window." },
      { status: 409 }
    );
  }

  const members = await prisma.user.findMany({
    where: { universityId: adminUser.universityId, role: { in: ["STUDENT", "SCRIBE"] } },
    select: { id: true, level: true, graduatedAt: true },
  });

  const updates: Array<ReturnType<typeof prisma.user.update> | ReturnType<typeof prisma.university.update>> = [];
  let advancedCount = 0;
  let graduatedCount = 0;

  for (const member of members) {
    // Already graduated, or never set an academic level at all (e.g. an
    // account that hasn't completed onboarding) — nothing to advance.
    if (member.graduatedAt || !member.level) continue;

    const levelIndex = LEVELS.indexOf(member.level as (typeof LEVELS)[number]);
    if (levelIndex === -1) continue; // unrecognized/stale value — leave untouched rather than guess

    if (levelIndex === LEVELS.length - 1) {
      // Was already at the final level (500L) — graduates now. Level
      // itself is left as "500L" (it's still an accurate record of where
      // they finished), graduatedAt is what actually gates new uploads.
      updates.push(prisma.user.update({ where: { id: member.id }, data: { graduatedAt: now } }));
      graduatedCount++;
    } else {
      updates.push(prisma.user.update({ where: { id: member.id }, data: { level: LEVELS[levelIndex + 1] } }));
      advancedCount++;
    }
  }

  updates.push(prisma.university.update({ where: { id: university.id }, data: { lastLevelAdvanceAt: now } }));

  await prisma.$transaction(updates);

  return NextResponse.json({ advancedCount, graduatedCount });
});

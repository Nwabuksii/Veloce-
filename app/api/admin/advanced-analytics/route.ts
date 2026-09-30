import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { summarizePollResults, type PollAnalyticsRow } from "@/lib/poll-analytics";

// Reads the votes themselves (each carries its own copy of the poll's name
// and the option's label), not the recipients' message copies — so a result
// keeps counting after someone deletes the message from their inbox.
export const GET = requireRole("ADMIN", async (req: NextRequest, adminUser) => {
  const searchParams = new URL(req.url).searchParams;
  const search = searchParams.get("search")?.trim().toLowerCase() ?? "";
  const department = searchParams.get("department")?.trim();
  const course = searchParams.get("course")?.trim();
  const poll = searchParams.get("poll")?.trim() ?? "";

  const universityScope = { user: { universityId: adminUser.universityId } };

  const votes = await prisma.pollVote.findMany({
    where: {
      ...universityScope,
      ...(poll ? { OR: [{ pollGroupId: poll }, { messageId: poll }] } : {}),
    },
    include: {
      user: { select: { fullName: true, level: true, department: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: PollAnalyticsRow[] = votes.map((vote) => ({
    messageId: vote.messageId,
    pollGroupId: vote.pollGroupId,
    messageSubject: vote.pollSubject,
    messageBody: vote.pollBody,
    optionId: vote.optionId ?? `${vote.messageId}:${vote.optionOrder}`,
    optionLabel: vote.optionLabel,
    selectedAt: vote.createdAt.toISOString(),
    userId: vote.userId,
    userName: vote.user?.fullName ?? "Unknown voter",
    department: vote.user?.department?.name ?? "Unknown",
    course: vote.user?.level ?? null,
  }));

  const departmentOptions = Array.from(new Set(rows.map((r) => r.department).filter((value): value is string => Boolean(value)))).sort();
  const courseOptions = Array.from(new Set(rows.map((r) => r.course).filter((value): value is string => Boolean(value)))).sort();

  const filteredRows = rows.filter((row) => {
    const haystack = `${row.messageSubject} ${row.messageBody} ${row.optionLabel} ${row.userName} ${row.department ?? ""} ${row.course ?? ""}`.toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (department && row.department !== department) return false;
    if (course && row.course !== course) return false;
    return true;
  });

  const summary = summarizePollResults(filteredRows);

  // The list behind the "Poll" dropdown: every poll at this university that
  // has been sent or voted on, by name. Only sent with an unfiltered view so
  // the dropdown doesn't collapse to the one poll being shown.
  const [sentPolls, votedPolls] = await Promise.all([
    prisma.adminMessage.findMany({
      where: { type: "POLL", recipient: { universityId: adminUser.universityId } },
      distinct: ["pollGroupId"],
      select: { id: true, pollGroupId: true, subject: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.pollVote.findMany({
      where: universityScope,
      distinct: ["pollGroupId"],
      select: { messageId: true, pollGroupId: true, pollSubject: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);
  const pollMap = new Map<string, { id: string; subject: string; createdAt: Date }>();
  for (const m of sentPolls) {
    const id = m.pollGroupId ?? m.id;
    if (!pollMap.has(id)) pollMap.set(id, { id, subject: m.subject, createdAt: m.createdAt });
  }
  for (const v of votedPolls) {
    const id = v.pollGroupId ?? v.messageId;
    if (!pollMap.has(id)) pollMap.set(id, { id, subject: v.pollSubject, createdAt: v.createdAt });
  }
  const polls = Array.from(pollMap.values())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((p) => ({ id: p.id, subject: p.subject }));

  // The selected poll's header. Options come from a surviving copy of the
  // message when one exists (so options nobody picked still show with 0);
  // if every copy was deleted, they're rebuilt from the votes.
  let selectedPoll: { subject: string; body: string; options: Array<{ id: string; label: string; votes: number }> } | null = null;
  if (poll) {
    const copy = await prisma.adminMessage.findFirst({
      where: { type: "POLL", recipient: { universityId: adminUser.universityId }, OR: [{ pollGroupId: poll }, { id: poll }] },
      include: { pollOptions: { orderBy: { order: "asc" } } },
    });
    const counts = new Map<string, number>();
    for (const v of votes) counts.set(v.optionLabel, (counts.get(v.optionLabel) ?? 0) + 1);

    if (copy) {
      selectedPoll = {
        subject: copy.subject,
        body: copy.body,
        options: copy.pollOptions.map((o) => ({ id: o.id, label: o.label, votes: counts.get(o.label) ?? 0 })),
      };
    } else if (votes.length > 0) {
      const first = votes[0];
      selectedPoll = {
        subject: first.pollSubject,
        body: first.pollBody,
        options: Array.from(counts.entries()).map(([label, n], i) => ({ id: `${i}`, label, votes: n })),
      };
    }
  }

  return NextResponse.json({
    summary,
    rows: filteredRows,
    selectedPoll,
    polls,
    filters: {
      departmentOptions,
      courseOptions,
    },
  });
});

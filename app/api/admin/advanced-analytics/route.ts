import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { summarizePollResults, type PollAnalyticsRow } from "@/lib/poll-analytics";

export const GET = requireRole("ADMIN", async (req: NextRequest, adminUser) => {
  const searchParams = new URL(req.url).searchParams;
  const search = searchParams.get("search")?.trim().toLowerCase() ?? "";
  const department = searchParams.get("department")?.trim();
  const course = searchParams.get("course")?.trim();

  const messages = await prisma.adminMessage.findMany({
    where: {
      type: "POLL",
      recipient: { universityId: adminUser.universityId },
    },
    include: {
      pollOptions: {
        orderBy: { order: "asc" },
        include: {
          votes: {
            include: {
              user: {
                select: {
                  fullName: true,
                  level: true,
                  department: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: PollAnalyticsRow[] = [];
  for (const message of messages) {
    for (const option of message.pollOptions) {
      for (const vote of option.votes) {
        rows.push({
          messageId: message.id,
          messageSubject: message.subject,
          messageBody: message.body,
          optionId: option.id,
          optionLabel: option.label,
          selectedAt: vote.createdAt.toISOString(),
          userId: vote.userId,
          userName: vote.user?.fullName ?? "Unknown voter",
          department: vote.user?.department?.name ?? "Unknown",
          course: vote.user?.level ?? null,
        });
      }
    }
  }

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

  return NextResponse.json({
    summary,
    rows: filteredRows,
    filters: {
      departmentOptions,
      courseOptions,
    },
  });
});

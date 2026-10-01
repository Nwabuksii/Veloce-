import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { legacyDetails, parseFlagDetails, primaryCode } from "@/lib/flag-reasons";

// The moderation queue: every note waiting on an admin, each with WHY it is
// waiting (categories), the existing notes it looks like (so they can be
// opened and compared) and a little history on the scribe.
export const GET = requireRole("ADMIN", async (req: NextRequest, user) => {
  const notes = await prisma.note.findMany({
    where: {
      status: { in: ["FLAGGED", "PENDING_REVIEW"] },
      block: { course: { department: { universityId: user.universityId } } },
    },
    include: {
      block: { include: { course: true } },
      scribe: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const structured = notes.map((n) => ({ note: n, details: parseFlagDetails(n.flagDetails) ?? legacyDetails(n.flagReason) }));

  // Every note that is named as a match, in one query. Scoped to this
  // university so a stored id can never be used to read another school's note.
  const matchIds = Array.from(new Set(structured.flatMap((s) => s.details.matches.map((m) => m.noteId))));
  const matchedNotes = matchIds.length
    ? await prisma.note.findMany({
        where: { id: { in: matchIds }, block: { course: { department: { universityId: user.universityId } } } },
        select: {
          id: true,
          status: true,
          scribeId: true,
          createdAt: true,
          block: { select: { title: true, course: { select: { code: true } } } },
          scribe: { select: { fullName: true } },
        },
      })
    : [];
  const matchedById = new Map(matchedNotes.map((m) => [m.id, m]));

  // What each scribe in the queue has done before, to judge a first-timer
  // against someone with a record.
  const scribeIds = Array.from(new Set(notes.map((n) => n.scribeId)));
  const history = scribeIds.length
    ? await prisma.note.groupBy({
        by: ["scribeId", "status"],
        where: { scribeId: { in: scribeIds } },
        _count: { _all: true },
      })
    : [];
  const historyOf = (scribeId: string) => {
    const rows = history.filter((h) => h.scribeId === scribeId);
    const count = (status: string) => rows.find((r) => r.status === status)?._count._all ?? 0;
    return { live: count("LIVE"), rejected: count("REJECTED"), total: rows.reduce((sum, r) => sum + r._count._all, 0) };
  };

  return NextResponse.json({
    notes: structured.map(({ note, details }) => ({
      id: note.id,
      createdAt: note.createdAt,
      similarityScore: note.similarityScore,
      qualityScore: note.qualityScore,
      pageCount: note.pageCount,
      flagReason: note.flagReason,
      block: { title: note.block.title, course: { code: note.block.course.code } },
      scribe: { fullName: note.scribe.fullName, email: note.scribe.email, ...historyOf(note.scribe.id) },
      group: primaryCode(details.reasons),
      reasons: details.reasons,
      // Matches whose note no longer exists (or is outside this university)
      // are left out rather than shown as broken rows.
      matches: details.matches
        .map((m) => {
          const other = matchedById.get(m.noteId);
          if (!other) return null;
          return {
            noteId: other.id,
            similarity: m.similarity,
            exact: m.exact,
            status: other.status,
            courseCode: other.block.course.code,
            title: other.block.title,
            scribeName: other.scribe.fullName,
            sameScribe: other.scribeId === note.scribeId,
            uploadedAt: other.createdAt,
          };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null),
    })),
  });
});

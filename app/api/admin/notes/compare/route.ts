import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { jaccardSimilarity } from "@/lib/quality-check";

const MAX_SHOWN_CHARS = 20_000;
const MIN_SHARED_SENTENCE_CHARS = 30;

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Cuts text into sentence-sized pieces, each marked when the same sentence
// (ignoring case and punctuation) also appears in the other note.
function markShared(text: string, otherSentences: Set<string>): Array<{ text: string; shared: boolean }> {
  const pieces = text.slice(0, MAX_SHOWN_CHARS).split(/(?<=[.!?])\s+|\n+/).filter((p) => p.trim().length > 0);
  return pieces.map((p) => {
    const n = normalize(p);
    return { text: p, shared: n.length >= MIN_SHARED_SENTENCE_CHARS && otherSentences.has(n) };
  });
}

const sentenceSet = (text: string) =>
  new Set(
    text
      .slice(0, 100_000)
      .split(/(?<=[.!?])\s+|\n+/)
      .map(normalize)
      .filter((n) => n.length >= MIN_SHARED_SENTENCE_CHARS)
  );

// Side-by-side data for two notes at this admin's university: who/what each
// is, how alike they are, and each one's text with the shared sentences marked.
export const GET = requireRole("ADMIN", async (req: NextRequest, adminUser) => {
  const params = new URL(req.url).searchParams;
  const a = params.get("a");
  const b = params.get("b");
  if (!a || !b || a === b) {
    return NextResponse.json({ error: "Pick two different notes to compare" }, { status: 400 });
  }

  const notes = await prisma.note.findMany({
    where: { id: { in: [a, b] }, block: { course: { department: { universityId: adminUser.universityId } } } },
    select: {
      id: true,
      status: true,
      pageCount: true,
      extractedText: true,
      createdAt: true,
      block: { select: { title: true, course: { select: { code: true } } } },
      scribe: { select: { fullName: true } },
    },
  });
  const noteA = notes.find((n) => n.id === a);
  const noteB = notes.find((n) => n.id === b);
  if (!noteA || !noteB) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const textA = noteA.extractedText ?? "";
  const textB = noteB.extractedText ?? "";
  const setA = sentenceSet(textA);
  const setB = sentenceSet(textB);
  const sharedSentences = Array.from(setA).filter((s) => setB.has(s)).length;

  const describe = (n: typeof noteA, text: string, other: Set<string>) => ({
    id: n.id,
    status: n.status,
    pageCount: n.pageCount,
    uploadedAt: n.createdAt,
    courseCode: n.block.course.code,
    title: n.block.title,
    scribeName: n.scribe.fullName,
    hasText: text.trim().length > 0,
    segments: markShared(text, other),
  });

  return NextResponse.json({
    similarity: jaccardSimilarity(textA, textB),
    sharedSentences,
    a: describe(noteA, textA, setB),
    b: describe(noteB, textB, setA),
  });
});

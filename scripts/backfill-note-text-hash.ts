// One-off: fills Note.textHash for notes uploaded before the column existed,
// so the exact-duplicate check also covers them. Safe to re-run (it only
// touches rows where textHash is still empty). Notes with too little text to
// fingerprint stay NULL and are simply picked up again on a re-run.
//
// Usage:  npx tsx scripts/backfill-note-text-hash.ts
// Needs DATABASE_URL, like the app.

import { PrismaClient } from "@prisma/client";
import { textFingerprint } from "../lib/quality-check";

const prisma = new PrismaClient();

async function main() {
  let cursor: string | undefined;
  let updated = 0;

  for (;;) {
    const batch = await prisma.note.findMany({
      where: { textHash: null, extractedText: { not: null } },
      select: { id: true, extractedText: true },
      orderBy: { id: "asc" },
      take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const note of batch) {
      const textHash = textFingerprint(note.extractedText ?? "");
      if (!textHash) continue;
      await prisma.note.update({ where: { id: note.id }, data: { textHash } });
      updated++;
    }
  }

  console.log(`Backfilled ${updated} note(s).`);
}

main().finally(() => prisma.$disconnect());

// Deletes notes that are NOT live (PENDING_REVIEW, FLAGGED, APPROVED, REJECTED)
// — including the broken/half-uploaded ones from the upload bug fixed
// alongside this script — plus their cached page-render images, and their
// stored PDF file in Vercel Blob.
//
// SAFETY: a note that anyone has actually purchased is never touched, even
// if it's not LIVE (e.g. an admin removed it after it was bought) — those
// buyers still need access to it via /notes/[id]/read, and the Purchase
// row's foreign key would block the delete anyway. Those are printed out
// so you can review them by hand (via /admin/moderation or similar).
//
// Usage:
//   node scripts/clear-non-live-notes.js            (dry run — lists what would be deleted)
//   node scripts/clear-non-live-notes.js --confirm   (actually deletes)
//
// Safe to run more than once — once a note's gone, it's a no-op for it.

const { PrismaClient } = require("@prisma/client");
const { del } = require("@vercel/blob");
const prisma = new PrismaClient();

const CONFIRM = process.argv.includes("--confirm");

async function main() {
  const candidates = await prisma.note.findMany({
    where: {
      status: { not: "LIVE" },
      purchases: { none: {} },
    },
    select: {
      id: true,
      status: true,
      fileUrl: true,
      createdAt: true,
      scribe: { select: { email: true } },
      block: { select: { title: true } },
    },
  });

  const skipped = await prisma.note.findMany({
    where: {
      status: { not: "LIVE" },
      purchases: { some: {} },
    },
    select: { id: true, status: true, block: { select: { title: true } } },
  });

  if (skipped.length > 0) {
    console.log(`Skipping ${skipped.length} non-live note(s) that were already purchased — review manually:`);
    for (const n of skipped) {
      console.log(`  - ${n.id} [${n.status}] "${n.block.title}"`);
    }
    console.log("");
  }

  if (candidates.length === 0) {
    console.log("Nothing to delete — no unpurchased, non-live notes found.");
    return;
  }

  console.log(`${CONFIRM ? "Deleting" : "Would delete"} ${candidates.length} note(s):`);
  for (const n of candidates) {
    console.log(`  - ${n.id} [${n.status}] "${n.block.title}" — uploaded ${n.createdAt.toISOString()} by ${n.scribe.email}`);
  }

  if (!CONFIRM) {
    console.log("\nDry run only — nothing was deleted. Re-run with --confirm to actually delete these.");
    return;
  }

  for (const n of candidates) {
    // NotePageImage and Report rows cascade automatically on note delete
    // (see schema.prisma) — only the blob file needs manual cleanup.
    try {
      await del(n.fileUrl);
    } catch (err) {
      console.error(`  Could not delete stored file for note ${n.id} (continuing anyway):`, err.message);
    }
    await prisma.note.delete({ where: { id: n.id } });
  }

  console.log(`\nDeleted ${candidates.length} note(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

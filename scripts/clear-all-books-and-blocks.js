// Deletes ALL notes and ALL blocks — including ones that were purchased.
// Unlike clear-non-live-notes.js, this does NOT protect purchased content:
// it also deletes the Purchase rows themselves (and the Reviews that hang
// off them). Reports tied to a deleted note/block/purchase cascade away
// automatically at the DB level (see schema.prisma onDelete: Cascade).
//
// Left alone on purpose:
//   - Courses, Departments, Universities — the catalog structure stays.
//   - Payout rows — these belong to the scribe (withdrawal history), not
//     to any specific note/block, so they're untouched.
//   - BlockRequest rows — a request is separate from the block that
//     fulfills it (blockId is nullable). Deleting blocks just detaches
//     them; any request left marked FULFILLED with no block behind it
//     is reset back to OPEN so it isn't stuck in a broken state.
//   - RequestVote rows — the demand signal (who asked for what) survives
//     independent of whether a block was ever made for it.
//
// Usage:
//   node scripts/clear-all-books-and-blocks.js            (dry run — reports what would be deleted)
//   node scripts/clear-all-books-and-blocks.js --confirm   (actually deletes)
//
// Safe to run more than once — once everything's gone, it's a no-op.

const { PrismaClient } = require("@prisma/client");
const { del } = require("@vercel/blob");
const prisma = new PrismaClient();

const CONFIRM = process.argv.includes("--confirm");

async function main() {
  const [noteCount, blockCount, purchaseCount, reviewCount, pageImageCount, reportCount, staleFulfilled] =
    await Promise.all([
      prisma.note.count(),
      prisma.block.count(),
      prisma.purchase.count(),
      prisma.review.count(),
      prisma.notePageImage.count(),
      prisma.report.count({
        where: { OR: [{ noteId: { not: null } }, { blockId: { not: null } }, { purchaseId: { not: null } }] },
      }),
      prisma.blockRequest.count({ where: { status: "FULFILLED" } }),
    ]);

  console.log(`${CONFIRM ? "Deleting" : "Would delete"}:`);
  console.log(`  - ${noteCount} note(s)`);
  console.log(`  - ${blockCount} block(s)`);
  console.log(`  - ${purchaseCount} purchase(s)`);
  console.log(`  - ${reviewCount} review(s)`);
  console.log(`  - ${pageImageCount} cached page image(s) (cascades with notes)`);
  console.log(`  - ${reportCount} report(s) referencing a note/block/purchase (cascades)`);
  console.log(`  - ${staleFulfilled} fulfilled request(s) will be reset to OPEN once their block is gone`);

  if (noteCount === 0 && blockCount === 0) {
    console.log("\nNothing to delete — no notes or blocks found.");
    return;
  }

  if (!CONFIRM) {
    console.log("\nDry run only — nothing was deleted. Re-run with --confirm to actually delete these.");
    return;
  }

  // Grab blob URLs before the rows disappear.
  const notes = await prisma.note.findMany({ select: { fileUrl: true } });
  const pageImages = await prisma.notePageImage.findMany({ select: { imageUrl: true } });

  console.log(`\nDeleting ${notes.length} stored PDF(s) and ${pageImages.length} cached page image(s) from blob storage...`);
  for (const url of [...notes.map((n) => n.fileUrl), ...pageImages.map((p) => p.imageUrl)]) {
    try {
      await del(url);
    } catch (err) {
      console.error(`  Could not delete blob ${url} (continuing anyway):`, err.message);
    }
  }

  // Order matters: Review and Purchase both have required, non-cascading
  // FKs to Note/Block, so they must go first. NotePageImage and Report
  // cascade automatically at the DB level once Note/Block/Purchase are gone.
  console.log("\nDeleting database rows...");
  await prisma.review.deleteMany({});
  await prisma.purchase.deleteMany({});
  await prisma.note.deleteMany({});
  await prisma.block.deleteMany({});

  const reset = await prisma.blockRequest.updateMany({
    where: { status: "FULFILLED", blockId: null },
    data: { status: "OPEN" },
  });

  console.log(`\nDeleted ${noteCount} note(s), ${blockCount} block(s), ${purchaseCount} purchase(s), ${reviewCount} review(s).`);
  console.log(`Reset ${reset.count} orphaned fulfilled request(s) back to OPEN.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

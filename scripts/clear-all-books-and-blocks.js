// Deletes ALL blocks only — no courses, no departments, no universities.
// This intentionally leaves the catalog structure in place while removing
// every block and the data tied directly to it (notes, purchases, reviews,
// reports, and any fulfilled request that was attached to that block).
//
// Usage:
//   node scripts/clear-all-books-and-blocks.js            (dry run)
//   node scripts/clear-all-books-and-blocks.js --confirm (actually deletes)
//
// Safe to run more than once — once everything is gone, it becomes a no-op.

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const CONFIRM = process.argv.includes("--confirm");

async function main() {
  const [blockCount, noteCount, purchaseCount, reviewCount, reportCount, fulfilledRequests] = await Promise.all([
    prisma.block.count(),
    prisma.note.count({ where: { blockId: { not: null } } }),
    prisma.purchase.count({ where: { blockId: { not: null } } }),
    prisma.review.count({ where: { purchase: { blockId: { not: null } } } }),
    prisma.report.count({ where: { blockId: { not: null } } }),
    prisma.blockRequest.count({ where: { blockId: { not: null }, status: "FULFILLED" } }),
  ]);

  console.log(`${CONFIRM ? "Deleting" : "Would delete"}:`);
  console.log(`  - ${blockCount} block(s)`);
  console.log(`  - ${noteCount} note(s) attached to blocks`);
  console.log(`  - ${purchaseCount} purchase(s) for those blocks`);
  console.log(`  - ${reviewCount} review(s) tied to those purchases`);
  console.log(`  - ${reportCount} report(s) attached to those blocks`);
  console.log(`  - ${fulfilledRequests} fulfilled request(s) attached to those blocks`);

  if (blockCount === 0) {
    console.log("\nNothing to delete — no blocks were found.");
    return;
  }

  if (!CONFIRM) {
    console.log("\nDry run only — nothing was deleted. Re-run with --confirm to actually delete the blocks.");
    return;
  }

  console.log("\nDeleting block-related rows...");

  await prisma.$transaction([
    prisma.review.deleteMany({ where: { purchase: { blockId: { not: null } } } }),
    prisma.report.deleteMany({ where: { blockId: { not: null } } }),
    prisma.purchase.deleteMany({ where: { blockId: { not: null } } }),
    prisma.note.deleteMany({ where: { blockId: { not: null } } }),
    prisma.blockRequest.updateMany({
      where: { blockId: { not: null } },
      data: { blockId: null, status: "OPEN" },
    }),
    prisma.block.deleteMany({}),
  ]);

  console.log(`\nDeleted ${blockCount} block(s) and all attached note/purchase/report rows.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

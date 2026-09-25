import { prisma } from "@/lib/prisma";

const MALICIOUS_THRESHOLD = 0.4;
const ADMIN_REVIEW_THRESHOLD = 0.7;

export async function evaluateBlockModeration(blockId: string) {
  const [purchaseBuyers, reportBuyers] = await Promise.all([
    prisma.purchase.findMany({
      where: { blockId },
      select: { buyerId: true },
      distinct: ["buyerId"],
    }),
    prisma.report.findMany({
      where: {
        blockId,
        type: { in: ["BLOCK", "REFUND"] },
        status: { not: "DISMISSED" },
      },
      select: { reporterId: true },
      distinct: ["reporterId"],
    }),
  ]);

  const uniqueBuyers = new Set(purchaseBuyers.map((p) => p.buyerId));
  const buyerReporters = new Set(
    reportBuyers.filter((report) => uniqueBuyers.has(report.reporterId)).map((report) => report.reporterId)
  );

  const totalBuyers = uniqueBuyers.size;
  const flaggedBuyers = buyerReporters.size;
  const ratio = totalBuyers > 0 ? flaggedBuyers / totalBuyers : 0;

  let moderationStatus: "NORMAL" | "POTENTIAL_MALICIOUS" | "ADMIN_REVIEW" = "NORMAL";
  if (ratio >= ADMIN_REVIEW_THRESHOLD) {
    moderationStatus = "ADMIN_REVIEW";
  } else if (ratio >= MALICIOUS_THRESHOLD) {
    moderationStatus = "POTENTIAL_MALICIOUS";
  }

  await prisma.block.update({
    where: { id: blockId },
    data: { moderationStatus },
  });

  return {
    blockId,
    moderationStatus,
    buyersCount: totalBuyers,
    flaggedBuyerCount: flaggedBuyers,
    ratio,
  };
}

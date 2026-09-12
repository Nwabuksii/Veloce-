-- AlterEnum
ALTER TYPE "ReportType" ADD VALUE 'REFUND';

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "redeemedWithCoupon" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "scribeCutOverride" INTEGER;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "purchaseId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "couponBalance" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

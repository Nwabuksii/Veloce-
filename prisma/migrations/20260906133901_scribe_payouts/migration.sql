/*
  Warnings:

  - The values [SCHEDULED] on the enum `PayoutStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `eligibleAt` on the `Payout` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[paystackTransferRef]` on the table `Payout` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PayoutStatus_new" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');
ALTER TABLE "Payout" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Payout" ALTER COLUMN "status" TYPE "PayoutStatus_new" USING ("status"::text::"PayoutStatus_new");
ALTER TYPE "PayoutStatus" RENAME TO "PayoutStatus_old";
ALTER TYPE "PayoutStatus_new" RENAME TO "PayoutStatus";
DROP TYPE "PayoutStatus_old";
ALTER TABLE "Payout" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- DropForeignKey
ALTER TABLE "Payout" DROP CONSTRAINT "Payout_scribeId_fkey";

-- AlterTable
ALTER TABLE "Payout" DROP COLUMN "eligibleAt",
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "processedById" TEXT,
ADD COLUMN     "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountName" TEXT,
ADD COLUMN     "accountNumber" TEXT,
ADD COLUMN     "bankCode" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "payoutRecipientCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payout_paystackTransferRef_key" ON "Payout"("paystackTransferRef");

-- CreateIndex
CREATE INDEX "Payout_scribeId_requestedAt_idx" ON "Payout"("scribeId", "requestedAt");

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_scribeId_fkey" FOREIGN KEY ("scribeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

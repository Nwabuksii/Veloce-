-- CreateEnum
CREATE TYPE "ApplicationType" AS ENUM ('APPLICATION', 'APPEAL');

-- DropForeignKey
ALTER TABLE "AdminMessage" DROP CONSTRAINT "AdminMessage_senderId_fkey";

-- DropIndex
DROP INDEX "ScribeApplication_userId_key";

-- AlterTable
ALTER TABLE "AdminMessage" ALTER COLUMN "senderId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ScribeApplication" ADD COLUMN     "type" "ApplicationType" NOT NULL DEFAULT 'APPLICATION';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "demotedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ScribeApplication_userId_type_submittedAt_idx" ON "ScribeApplication"("userId", "type", "submittedAt");

-- AddForeignKey
ALTER TABLE "AdminMessage" ADD CONSTRAINT "AdminMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

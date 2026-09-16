-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "avatarDisplay" TEXT NOT NULL DEFAULT 'default';

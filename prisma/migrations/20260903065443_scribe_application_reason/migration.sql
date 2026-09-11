/*
  Warnings:

  - Added the required column `reason` to the `ScribeApplication` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ScribeApplication" ADD COLUMN     "reason" TEXT NOT NULL;

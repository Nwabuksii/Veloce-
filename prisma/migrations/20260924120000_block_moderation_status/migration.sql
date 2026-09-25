CREATE TYPE "BlockModerationStatus" AS ENUM ('NORMAL', 'POTENTIAL_MALICIOUS', 'ADMIN_REVIEW');

ALTER TABLE "Block"
  ADD COLUMN "moderationStatus" "BlockModerationStatus" NOT NULL DEFAULT 'NORMAL';

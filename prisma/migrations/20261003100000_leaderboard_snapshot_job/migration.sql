-- Previous-run numbers on each snapshot, for "up 3 places" style messages.
ALTER TABLE "LeaderboardSnapshot" ADD COLUMN "previous" JSONB;

-- One row, used so only one server instance runs the snapshot job at a time
-- and so the job knows when it last finished.
CREATE TABLE "LeaderboardLock" (
    "id" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),

    CONSTRAINT "LeaderboardLock_pkey" PRIMARY KEY ("id")
);

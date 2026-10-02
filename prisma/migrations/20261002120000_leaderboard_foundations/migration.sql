-- Scribe leaderboard foundations: the semester calendar, per-scribe score
-- snapshots (written by the nightly job), and earned/pinned badges.

CREATE TYPE "LeaderboardPeriod" AS ENUM ('ALL_TIME', 'SEMESTER', 'YEAR');

CREATE TABLE "Semester" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Semester_universityId_academicYear_number_key" ON "Semester"("universityId", "academicYear", "number");
CREATE INDEX "Semester_universityId_startsAt_idx" ON "Semester"("universityId", "startsAt");

ALTER TABLE "Semester" ADD CONSTRAINT "Semester_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LeaderboardSnapshot" (
    "id" TEXT NOT NULL,
    "scribeId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "departmentId" TEXT,
    "periodType" "LeaderboardPeriod" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "ratingPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchasePoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "readPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "followerPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "growthPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reachedScoreAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rankDepartment" INTEGER,
    "rankSchool" INTEGER,
    "rankGlobal" INTEGER,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderboardSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeaderboardSnapshot_scribeId_periodType_periodKey_key" ON "LeaderboardSnapshot"("scribeId", "periodType", "periodKey");
CREATE INDEX "LeaderboardSnapshot_periodType_periodKey_universityId_fina_idx" ON "LeaderboardSnapshot"("periodType", "periodKey", "universityId", "finalScore");
CREATE INDEX "LeaderboardSnapshot_periodType_periodKey_finalScore_idx" ON "LeaderboardSnapshot"("periodType", "periodKey", "finalScore");

ALTER TABLE "LeaderboardSnapshot" ADD CONSTRAINT "LeaderboardSnapshot_scribeId_fkey" FOREIGN KEY ("scribeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ScribeBadge" (
    "id" TEXT NOT NULL,
    "scribeId" TEXT NOT NULL,
    "badgeKey" TEXT NOT NULL,
    "periodType" "LeaderboardPeriod" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pinnedAt" TIMESTAMP(3),

    CONSTRAINT "ScribeBadge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScribeBadge_scribeId_badgeKey_periodType_periodKey_key" ON "ScribeBadge"("scribeId", "badgeKey", "periodType", "periodKey");
CREATE INDEX "ScribeBadge_scribeId_pinnedAt_idx" ON "ScribeBadge"("scribeId", "pinnedAt");

ALTER TABLE "ScribeBadge" ADD CONSTRAINT "ScribeBadge_scribeId_fkey" FOREIGN KEY ("scribeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

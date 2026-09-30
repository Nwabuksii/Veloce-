-- Permanent security history (shown at /admin/security). Deliberately no
-- foreign key on userId: history must survive an account being deleted.
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "userId" TEXT,
    "universityId" TEXT,
    "ip" TEXT,
    "details" JSONB,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SecurityEvent_universityId_createdAt_idx" ON "SecurityEvent"("universityId", "createdAt");
CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt");

-- One row, used so only one server instance runs the monthly clear-out.
CREATE TABLE "SecurityLogLock" (
    "id" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityLogLock_pkey" PRIMARY KEY ("id")
);

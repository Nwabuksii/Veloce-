-- Task 1: indexes for the highest-frequency queries.
CREATE INDEX "Purchase_buyerId_idx" ON "Purchase"("buyerId");
CREATE INDEX "Purchase_noteId_idx" ON "Purchase"("noteId");
CREATE INDEX "Purchase_refundedAt_idx" ON "Purchase"("refundedAt");
CREATE INDEX "Purchase_buyerId_noteId_idx" ON "Purchase"("buyerId", "noteId");

CREATE INDEX "Note_status_idx" ON "Note"("status");
CREATE INDEX "Note_scribeId_idx" ON "Note"("scribeId");
CREATE INDEX "Note_status_scribeId_idx" ON "Note"("status", "scribeId");

-- Task 3: Terms acceptance timestamp, and the missing FK from User to
-- Department (departmentId existed as a bare column with no constraint —
-- this both enables querying the department relation and catches any
-- stray invalid IDs).
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Task 4: native polls + message priority.
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'POLL');
CREATE TYPE "MessagePriority" AS ENUM ('NORMAL', 'SERIOUS');

ALTER TABLE "AdminMessage" ADD COLUMN "type" "MessageType" NOT NULL DEFAULT 'TEXT';
ALTER TABLE "AdminMessage" ADD COLUMN "priority" "MessagePriority" NOT NULL DEFAULT 'NORMAL';

CREATE TABLE "PollOption" (
    "id"        TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "label"     TEXT NOT NULL,
    "order"     INTEGER NOT NULL,

    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PollOption_messageId_order_key" ON "PollOption"("messageId", "order");
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "AdminMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PollVote" (
    "id"        TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "optionId"  TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PollVote_messageId_userId_key" ON "PollVote"("messageId", "userId");
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_optionId_fkey"
  FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Task 5: staged sign-up.
CREATE TABLE "PendingRegistration" (
    "id"                 TEXT NOT NULL,
    "email"              TEXT NOT NULL,
    "passwordHash"       TEXT NOT NULL,
    "fullName"           TEXT NOT NULL,
    "fullNameNormalized" TEXT NOT NULL,
    "universityId"       TEXT NOT NULL,
    "departmentId"       TEXT,
    "level"              TEXT,
    "termsAcceptedAt"    TIMESTAMP(3),
    "verificationToken"  TEXT NOT NULL,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingRegistration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PendingRegistration_email_key" ON "PendingRegistration"("email");
CREATE UNIQUE INDEX "PendingRegistration_fullNameNormalized_key" ON "PendingRegistration"("fullNameNormalized");
CREATE UNIQUE INDEX "PendingRegistration_verificationToken_key" ON "PendingRegistration"("verificationToken");
CREATE INDEX "PendingRegistration_expiresAt_idx" ON "PendingRegistration"("expiresAt");
ALTER TABLE "PendingRegistration" ADD CONSTRAINT "PendingRegistration_universityId_fkey"
  FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

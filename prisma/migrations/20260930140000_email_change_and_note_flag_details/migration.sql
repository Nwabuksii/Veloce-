-- Changing an account email now needs a click from the NEW address, and the
-- OLD address gets a "this wasn't me" link. Only token hashes are stored.
CREATE TABLE "EmailChangeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "oldEmail" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "confirmTokenHash" TEXT NOT NULL,
    "revertTokenHash" TEXT NOT NULL,
    "confirmExpiresAt" TIMESTAMP(3) NOT NULL,
    "revertExpiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailChangeRequest_confirmTokenHash_key" ON "EmailChangeRequest"("confirmTokenHash");
CREATE UNIQUE INDEX "EmailChangeRequest_revertTokenHash_key" ON "EmailChangeRequest"("revertTokenHash");
CREATE INDEX "EmailChangeRequest_userId_idx" ON "EmailChangeRequest"("userId");

ALTER TABLE "EmailChangeRequest" ADD CONSTRAINT "EmailChangeRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Structured "why is this note in the review queue" (reasons + the notes it
-- looks like). The old free-text flagReason stays for older rows.
ALTER TABLE "Note" ADD COLUMN "flagDetails" JSONB;

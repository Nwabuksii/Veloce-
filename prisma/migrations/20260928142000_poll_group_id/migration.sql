-- Give all recipient copies of a broadcast poll a shared analytics identity.
ALTER TABLE "AdminMessage" ADD COLUMN "pollGroupId" TEXT;

CREATE INDEX "AdminMessage_pollGroupId_idx" ON "AdminMessage"("pollGroupId");

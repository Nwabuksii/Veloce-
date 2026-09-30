-- A poll vote used to be deleted together with the recipient's copy of the
-- message (cascade through PollOption). Now the vote carries its own copy of
-- what analytics needs, and deleting the message only detaches it.

ALTER TABLE "PollVote" ADD COLUMN "pollGroupId" TEXT;
ALTER TABLE "PollVote" ADD COLUMN "pollSubject" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PollVote" ADD COLUMN "pollBody" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PollVote" ADD COLUMN "senderId" TEXT;
ALTER TABLE "PollVote" ADD COLUMN "optionLabel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PollVote" ADD COLUMN "optionOrder" INTEGER NOT NULL DEFAULT 0;

-- Polls sent before pollGroupId existed have no group, so each recipient's
-- copy looked like its own poll. Give every such send (same sender, subject,
-- body and send time) one shared group id.
WITH groups AS MATERIALIZED (
  SELECT "senderId", "subject", "body", "createdAt", gen_random_uuid()::text AS gid
  FROM "AdminMessage"
  WHERE "type" = 'POLL' AND "pollGroupId" IS NULL
  GROUP BY "senderId", "subject", "body", "createdAt"
)
UPDATE "AdminMessage" m
SET "pollGroupId" = g.gid
FROM groups g
WHERE m."type" = 'POLL'
  AND m."pollGroupId" IS NULL
  AND m."senderId" IS NOT DISTINCT FROM g."senderId"
  AND m."subject" = g."subject"
  AND m."body" = g."body"
  AND m."createdAt" = g."createdAt";

-- Fill in the copied fields for every existing vote.
UPDATE "PollVote" v
SET "pollGroupId" = m."pollGroupId",
    "pollSubject" = m."subject",
    "pollBody" = m."body",
    "senderId" = m."senderId",
    "optionLabel" = o."label",
    "optionOrder" = o."order"
FROM "PollOption" o
JOIN "AdminMessage" m ON m."id" = o."messageId"
WHERE v."optionId" = o."id";

-- The vote must outlive its option: detach instead of delete.
ALTER TABLE "PollVote" ALTER COLUMN "optionId" DROP NOT NULL;
ALTER TABLE "PollVote" DROP CONSTRAINT "PollVote_optionId_fkey";
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_optionId_fkey"
  FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PollVote_pollGroupId_idx" ON "PollVote"("pollGroupId");
CREATE INDEX "PollVote_senderId_idx" ON "PollVote"("senderId");

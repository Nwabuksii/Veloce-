-- Records WHY a note was flagged (previously only a boolean + raw score —
-- admins had to guess whether it was near-duplicate content, too short, or
-- something else), and the scribe's own upload-time confirmation that the
-- notes are their original work from attending the lecture.
ALTER TABLE "Note" ADD COLUMN "flagReason" TEXT;
ALTER TABLE "Note" ADD COLUMN "attestedOriginal" BOOLEAN NOT NULL DEFAULT false;

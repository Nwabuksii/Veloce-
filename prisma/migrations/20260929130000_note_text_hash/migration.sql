-- Fingerprint of a note's extracted text, so an exact re-upload can be found
-- with one indexed lookup instead of comparing against every note. Existing
-- rows stay NULL until scripts/backfill-note-text-hash.ts is run.
ALTER TABLE "Note" ADD COLUMN "textHash" TEXT;
CREATE INDEX "Note_textHash_idx" ON "Note"("textHash");

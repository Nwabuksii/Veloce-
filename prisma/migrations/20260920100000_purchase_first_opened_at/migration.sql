-- Tracks whether the buyer has ever actually opened a purchased note, so
-- the purchases page can nudge "you haven't started reading this yet."
-- Nullable, set once (see app/api/notes/[id]/page/[num]/route.ts) and
-- never updated again — existing rows correctly default to NULL
-- ("never opened") rather than us guessing at a backfill value.
ALTER TABLE "Purchase" ADD COLUMN "firstOpenedAt" TIMESTAMP(3);

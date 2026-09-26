-- Permanent snapshot of the scribe's own level at the moment they
-- uploaded each note (see prisma/schema.prisma Note.scribeLevelAtUpload
-- for why this can't just be read live off User.level).
ALTER TABLE "Note"
  ADD COLUMN "scribeLevelAtUpload" TEXT;

-- Gates the upload action once a scribe is past the final level (500L);
-- role stays SCRIBE so existing notes/earnings are unaffected.
ALTER TABLE "User"
  ADD COLUMN "graduatedAt" TIMESTAMP(3);

-- Which catalog a user has chosen to see. Nullable, not boolean, so "no
-- choice made yet" is distinguishable from "chose ALL on purpose" — see
-- the multi-university scope design in schema comments. Unused until a
-- second university exists.
CREATE TYPE "CatalogScope" AS ENUM ('OWN', 'ALL');

ALTER TABLE "User"
  ADD COLUMN "catalogScope" "CatalogScope";

-- Locks the admin "start a new level" action to once per May/July window
-- per university.
ALTER TABLE "University"
  ADD COLUMN "lastLevelAdvanceAt" TIMESTAMP(3);

-- One-time marker for when a university crosses the "enough of its own
-- catalog" threshold — never recalculated live, never itself changes any
-- user's stored scope. Unused until a second university exists.
ALTER TABLE "University"
  ADD COLUMN "wentLocalAt" TIMESTAMP(3);

-- Simplify the credit model to a pure escrow design (see lib/pricing.ts):
-- a purchase's money isn't the scribe's or the platform's until it clears
-- or a refund request is declined, so an APPROVED refund never has
-- anything to claw back from anyone — the whole price just returns to
-- credit, dollar for dollar. That makes credit always 100% real cash, so
-- the previous migration's partial "backing" tracking is no longer needed.
ALTER TABLE "User" DROP COLUMN IF EXISTS "creditBacking";
ALTER TABLE "Purchase" DROP COLUMN IF EXISTS "creditBackingUsed";
ALTER TABLE "Purchase" DROP COLUMN IF EXISTS "scribeCutOverride";
ALTER TABLE "ConvertedPayment" DROP COLUMN IF EXISTS "backing";

-- Case-insensitive unique display names, plus five reserved names blocked
-- at signup — VELOCE, ADMIN, CEO, SCRIBE, STUDENT (see
-- app/api/auth/signup/route.ts). fullNameNormalized is a plain
-- lowercased/trimmed copy of fullName, kept in sync at signup only
-- (fullName is never editable afterward) — Prisma's schema can't express a
-- unique index on lower(fullName) directly, so this is the equivalent.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fullNameNormalized" TEXT;

-- Backfill from existing names. This app never enforced uniqueness before
-- now, so two users may already share a name case-insensitively — every
-- row but the oldest for a given name gets a numeric suffix so the
-- backfill can't fail on the new unique constraint below. An admin should
-- follow up with anyone who got a suffixed name.
-- Uses COALESCE/NULLIF to generate fallbacks if any existing fullName is NULL or empty.
WITH ranked AS (
  SELECT 
    "id", 
    COALESCE(NULLIF(LOWER(TRIM("fullName")), ''), 'user-' || SUBSTRING("id"::text FROM 1 FOR 8)) AS base,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(NULLIF(LOWER(TRIM("fullName")), ''), 'user-' || SUBSTRING("id"::text FROM 1 FOR 8)) 
      ORDER BY "createdAt"
    ) AS rn
  FROM "User"
)
UPDATE "User" u
SET "fullNameNormalized" = CASE 
  WHEN ranked.rn = 1 THEN ranked.base 
  ELSE ranked.base || '-' || ranked.rn 
END
FROM ranked
WHERE u."id" = ranked."id";

ALTER TABLE "User" ALTER COLUMN "fullNameNormalized" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "User_fullNameNormalized_key" ON "User"("fullNameNormalized");

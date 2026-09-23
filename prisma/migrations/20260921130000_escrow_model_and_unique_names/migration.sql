-- Simplify the credit model to a pure escrow design
ALTER TABLE IF EXISTS "User" DROP COLUMN IF EXISTS "creditBacking";
ALTER TABLE IF EXISTS "Purchase" DROP COLUMN IF EXISTS "creditBackingUsed";
ALTER TABLE IF EXISTS "Purchase" DROP COLUMN IF EXISTS "scribeCutOverride";
ALTER TABLE IF EXISTS "ConvertedPayment" DROP COLUMN IF EXISTS "backing";

-- Case-insensitive unique display names
ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "fullNameNormalized" TEXT;

-- Backfill from existing names
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

-- Enforce NOT NULL constraint and Unique Index
ALTER TABLE IF EXISTS "User" ALTER COLUMN "fullNameNormalized" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "User_fullNameNormalized_key" ON "User"("fullNameNormalized");

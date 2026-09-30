-- Phase 4: rules the application already assumes, now also enforced by the
-- database. Written so that this migration can NEVER fail a deploy because of
-- old data:
--   * CHECK constraints are added NOT VALID: enforced for every new write,
--     existing rows are not scanned. (Run the VALIDATE statements at the
--     bottom of this file by hand once you've confirmed the data is clean.)
--   * Each partial unique index is only created if no duplicates exist yet;
--     otherwise it is skipped with a NOTICE and can be added later.
-- Prisma can't express either kind in schema.prisma, so they live only here.

-- ── Money can't go negative ──────────────────────────────
ALTER TABLE "User" ADD CONSTRAINT "User_creditBalance_nonneg" CHECK ("creditBalance" >= 0) NOT VALID;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_amount_positive" CHECK ("amount" > 0) NOT VALID;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_amounts_nonneg" CHECK ("amountPaid" >= 0 AND "creditApplied" >= 0) NOT VALID;
ALTER TABLE "ConvertedPayment" ADD CONSTRAINT "ConvertedPayment_amount_nonneg" CHECK ("amount" >= 0) NOT VALID;

-- ── One open report per reporter per target ──────────────
-- (Phase 2 added the application check; this closes the simultaneous-request gap.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Report" WHERE "status" = 'PENDING' AND "type" = 'BLOCK' AND "noteId" IS NOT NULL
    GROUP BY "reporterId", "noteId" HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Skipped Report_open_note_report_key: duplicate open note reports exist';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "Report_open_note_report_key" ON "Report" ("reporterId", "noteId")
      WHERE "status" = 'PENDING' AND "type" = 'BLOCK' AND "noteId" IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Report" WHERE "status" = 'PENDING' AND "type" = 'BLOCK' AND "noteId" IS NULL AND "blockId" IS NOT NULL
    GROUP BY "reporterId", "blockId" HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Skipped Report_open_block_report_key: duplicate open block reports exist';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "Report_open_block_report_key" ON "Report" ("reporterId", "blockId")
      WHERE "status" = 'PENDING' AND "type" = 'BLOCK' AND "noteId" IS NULL AND "blockId" IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Report" WHERE "status" = 'PENDING' AND "type" = 'USER' AND "reportedUserId" IS NOT NULL
    GROUP BY "reporterId", "reportedUserId" HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Skipped Report_open_user_report_key: duplicate open user reports exist';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "Report_open_user_report_key" ON "Report" ("reporterId", "reportedUserId")
      WHERE "status" = 'PENDING' AND "type" = 'USER' AND "reportedUserId" IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Report" WHERE "status" = 'PENDING' AND "type" = 'REFUND' AND "purchaseId" IS NOT NULL
    GROUP BY "purchaseId" HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Skipped Report_open_refund_request_key: duplicate open refund requests exist';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "Report_open_refund_request_key" ON "Report" ("purchaseId")
      WHERE "status" = 'PENDING' AND "type" = 'REFUND' AND "purchaseId" IS NOT NULL;
  END IF;

  -- ── A buyer can hold only one un-refunded purchase of a note ──
  -- lib/complete-purchase.ts checks this in application code, but two
  -- different Paystack references paid at the same moment could both pass
  -- the check. With this index the second one fails and is turned into credit.
  IF EXISTS (
    SELECT 1 FROM "Purchase" WHERE "refundedAt" IS NULL GROUP BY "buyerId", "noteId" HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Skipped Purchase_active_buyer_note_key: a buyer already has duplicate active purchases of one note';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "Purchase_active_buyer_note_key" ON "Purchase" ("buyerId", "noteId")
      WHERE "refundedAt" IS NULL;
  END IF;
END $$;

-- ── Optional, once existing data is confirmed clean ──────
-- ALTER TABLE "User" VALIDATE CONSTRAINT "User_creditBalance_nonneg";
-- ALTER TABLE "Payout" VALIDATE CONSTRAINT "Payout_amount_positive";
-- ALTER TABLE "Purchase" VALIDATE CONSTRAINT "Purchase_amounts_nonneg";
-- ALTER TABLE "ConvertedPayment" VALIDATE CONSTRAINT "ConvertedPayment_amount_nonneg";

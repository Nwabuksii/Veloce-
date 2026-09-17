-- Coupons become a ₦ credit balance instead of a flat "1 free purchase"
-- redemption count — see User.creditBalance and Purchase.creditApplied
-- comments in schema.prisma for why (fixes: a refund on a cheap
-- request-priced block could previously buy a full-price block for free).
ALTER TABLE "User" RENAME COLUMN "couponBalance" TO "creditBalance";

-- Conservative backfill for whoever already holds old-style coupons:
-- treat each one as worth ₦900 (the fixed request-fulfillment price,
-- the smaller of the two amounts a refund could have granted) rather than
-- guessing at a larger block price. Undercrediting existing balances is
-- safe; overcrediting them would just recreate the same exploit once more.
UPDATE "User" SET "creditBalance" = "creditBalance" * 900 WHERE "creditBalance" > 0;

-- How much of a purchase's price was covered by credit (0 for a normal
-- cash purchase). Historical coupon-redeemed rows default to 0 here since
-- we don't know their original price — the only effect is that refunding
-- one of those old rows today won't re-grant credit for it, which is the
-- safe direction to be wrong in.
ALTER TABLE "Purchase" ADD COLUMN "creditApplied" INTEGER NOT NULL DEFAULT 0;

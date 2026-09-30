-- Session versioning: lets a password reset/change, demotion or ban invalidate
-- every JWT issued before it. Existing rows start at 0, which is what tokens
-- issued before this migration are treated as carrying, so nobody is logged out.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

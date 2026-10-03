-- New role for removed accounts. Kept in its own migration: a new enum value
-- cannot be used in the same transaction that adds it.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DELETED';

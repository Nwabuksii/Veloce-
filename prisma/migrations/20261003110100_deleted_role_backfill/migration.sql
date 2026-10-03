-- Move accounts already removed by scripts/delete-user.js out of the
-- student/scribe lists.
UPDATE "User" SET "role" = 'DELETED' WHERE "email" LIKE '%@deleted.invalid';

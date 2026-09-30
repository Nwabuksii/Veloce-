# Veloce — Phase 7 (final phase)

Unzip `veloce-phase7.zip` over the project (on top of Phases 1–6). One new migration, no new dependencies.

## Do this by hand
In `prisma/schema.prisma`, replace the whole `model PollVote { ... }` block with the one in `POLLVOTE-SCHEMA-REPLACE.prisma.txt`. Then deploy (the build runs `prisma migrate deploy`).
The migration uses `gen_random_uuid()` (built into Postgres 13+; older versions need the `pgcrypto` extension).

## 1. Poll votes survive message deletion
- Each vote now stores its own copy of the poll name, body, sender and the chosen option's label. Deleting a message detaches the vote instead of deleting it.
- Analytics (`/api/admin/advanced-analytics`) reads the votes directly, so results no longer shrink when people tidy their inbox.
- A poll whose recipients all deleted their copies still appears in the admin's "Recently sent" list, so its analytics stay reachable.
- The migration copies the data onto every existing vote, so old results are kept.

## 2. Site dialog instead of the browser popup
- New `app/components/ConfirmDialog.tsx` (same look as the credit dialog; Escape or a click outside cancels).
- The inbox delete uses it. For a poll you voted on it says your vote still counts.
- The only other browser `confirm()` left is "advance every student one level" on Admin → Users. Say if you want that one swapped too.

## 3. Poll click → Advanced analytics
Cause found: polls sent before poll grouping existed had no group id, so each recipient's copy looked like its own poll and the link filtered to a single person's copy. The migration now gives those old polls a proper group.
- Clicking a poll in Message users opens analytics filtered to that poll (no more search-text hack, and no double navigation).
- New **Poll** dropdown on the analytics page lists polls by name, so you can also switch between them there.
- A poll with no votes now says "Nobody has voted on this poll yet."

## 4. Orphaned note files
- A failed upload after the PDF was stored now deletes that PDF (`deleteNoteFile` in `lib/storage.ts`).
- `node scripts/clean-orphan-note-files.js` (dry run) then `--commit` removes files left by earlier failures. It ignores anything under an hour old. Untested against Cloudinary — read the dry-run list before using `--commit`.

## 5. Bank account numbers
`/api/scribe/payout-account` now returns only `••••1234`; the earnings page already showed just the last 4. Admins still see the full number on the payouts page, because you pay by hand.

## Not done, on purpose
- **Logout everywhere:** would sign users out of all their devices whenever they log out from one. Not built unless you ask.
- **Central "belongs to my university" helper:** a refactor across many routes, not a bug fix; I won't change working routes without being able to run them.

## Not verified
No `npm install`, `tsc`, database or Cloudinary here. All files pass a syntax check only. Run `npx prisma generate && npx tsc --noEmit && npm test`, then by hand:
1. Vote on a poll, delete the message, check the vote still shows in Advanced analytics.
2. Click an old poll and a new poll in Message users — both open analytics with the right votes.
3. Force a failed upload and check no file is left in Cloudinary `notes/`.

# Phase 3 — reads signal and request-fulfilled message (overlay)

Apply AFTER Phase 1 (it contains Phase 1's edit to `page/[num]/route.ts`). Overwrites 6 files, adds 1 (`lib/notify-requesters.ts`). No schema change, no migration.

| # | Change | Files |
|---|---|---|
| 1 | `Purchase.firstOpenedAt` is now set by every route the reader calls (`/pages`, `/all-pages`, `/page/[num]`) through one helper, `markNoteOpened`. Fixes the Purchases "not opened" nudge and the leaderboard "reads" points. Owner/admin previews still don't set it (no Purchase row) | `lib/note-access.ts`, the 3 note routes |
| 7 | "Your request was fulfilled" message is no longer sent when the block is created. It is sent to the request's voters when the first note for that request goes LIVE (`render-queue`), once per request | `app/api/scribe/blocks/route.ts`, `lib/render-queue.ts`, `lib/notify-requesters.ts` |

Notes
- Your answer on #1 was about the "Not started" badge only; I read "book opens" as opening the reader, so the first reader call counts as the read.
- Already-fulfilled requests whose notes are already LIVE are not re-notified. Requests fulfilled but not yet LIVE will notify when their note goes LIVE.
- Not type-checked or run here (no `node_modules`): please run `npm run typecheck` and `npm test`.

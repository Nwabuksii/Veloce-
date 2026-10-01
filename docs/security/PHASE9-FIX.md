# Fix: approved notes never going live + mobile "Your notes" rows

## Cause
Approving (and uploading) started the PDF render with `void queueNoteRender(...)` — fire and forget. On Vercel the function is stopped as soon as the response is sent, so the render never finished and the note never reached LIVE.

## Changes
- `app/api/admin/notes/[id]/approve/route.ts` — render is awaited, `maxDuration = 60`, no double follower notification, clear error if rendering fails.
- `app/api/scribe/upload/route.ts` — same (non-flagged uploads), `maxDuration = 60`.
- `lib/render-queue.ts` — a failed/incomplete render puts the note back in the admin queue ("Page rendering failed — approve again to retry") instead of leaving it stuck.
- `app/scribe/workspace/page.tsx` — "Publishing" label for RENDERING; "In review" counts only notes actually waiting on an admin.
- `app/globals.css` — mobile layout for the scribe "Your notes" rows (appended block at the end).

## Notes already stuck
Run once in the Neon SQL editor, then approve them again from the queue:
```sql
UPDATE "Note" SET status = 'FLAGGED', "flaggedForReview" = true WHERE status = 'RENDERING';
```

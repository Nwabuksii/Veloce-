# Veloce security fixes — Phase 2 (resource exhaustion + abuse limits)

Unzip `veloce-phase2.zip` over the project (on top of Phase 1). **One new migration** (adds `Note.textHash`); the build already runs `prisma migrate deploy`. No new dependencies.

## A · PDF rendering limits — `lib/pdf-render.ts`, `lib/async-limits.ts` (new)
- **Pixel cap:** every page is rendered at 2x, shrunk if that would pass 4096 px a side or 12 MP. An A4 page is unaffected (about 2 MP); a page declared as a billboard can no longer allocate a giant canvas. Embedded images over 16 MP are refused by pdf.js.
- **Bounded concurrency:** the unbounded `Promise.all` is now 3 pages at a time (`mapLimit`, ~20 lines, no dependency). After a failure no new pages start.
- **Time/size limits:** 300 pages max, 15 s per page (the render task is cancelled), 45 s per whole job. Breaking one throws `PdfLimitError`.
- **`isEvalSupported: false`** on every pdf.js document, so a crafted PDF can never make pdf.js compile code with `eval` (the class of bug behind CVE-2024-4367).
- The two render functions now share one page-render helper instead of two copies.
- **`all-pages`:** 20 requests / 5 min per user, `Cache-Control: private, no-store, no-cache, must-revalidate`, watermark stamping also 3 at a time, and the PDF is read from storage once instead of twice. Its LIVE check (Phase 1) is unchanged.
- **`page/[num]`:** a page number past `pageCount` now returns 404 before any database or storage work.

## B · Upload hardening — `app/api/scribe/upload/route.ts`
- **10 uploads / hour per scribe**, checked before the body is read.
- Oversized `Content-Length` is refused (413) before buffering.
- Extension must be `.pdf` as well as the MIME type. The `%PDF-` magic-byte check and 3 MB limit were already there and stay.
- New `inspectPdf` runs **first**, before `pdf-parse`: rejects too many pages, any page over 5000 pt, and corrupt/truncated files, in one pass, with a clear message. Before, the heavier `pdf-parse` ran first and the page limit was checked after it.
- `pdf-parse` now has a 30 s timeout. (It stops the wait, not the work: JavaScript can't cancel a running parse.)
- There are no temp files in this flow, so there was nothing to clean up. Orphaned stored files after a failed save are Phase 5.

## C · Quality-check DoS — `lib/quality-check.ts`, `schema.prisma`, migration `20260929130000_note_text_hash`
- **Old:** every upload loaded and compared against *every* live/flagged note at the university, so cost grew with the whole platform.
- **New:** (1) text is capped at 100,000 chars before it is stored, fingerprinted or compared; (2) similarity runs only against the 100 most recent notes **in the same course**; (3) an **exact** re-upload anywhere in the university is found with one indexed lookup on `Note.textHash` (SHA-256 of the text with case/punctuation/spacing removed). The new note's word set is also built once, not once per existing note.
- **Why course, not block:** the old university-wide scan existed to catch the same PDF re-uploaded under a new block title. The fingerprint keeps that covered for exact copies; the course scope covers near-copies within the course. **Trade-off:** a *lightly edited* copy placed in a *different course* is no longer caught. Say if you want a wider scope.
- **Legacy notes:** existing rows have no hash. Run `npx tsx scripts/backfill-note-text-hash.ts` once after deploy (safe to re-run). Until then, old notes are only covered by the similarity check.
- A separate cache of similarity results wasn't added: the fingerprint already makes exact repeats one lookup.

## D · Other limits
| Route | Limit (per user) |
|---|---|
| `payments/initialize` | 10 / 10 min |
| note, block and user reports (shared) | 10 / hour |
| `scribe/blocks` POST (block creation) | 20 / hour |
| `scribe/courses` POST (course creation) | 20 / hour |
| `account/avatar` POST | 10 / hour |
| `account` PATCH, only when it checks `currentPassword` | 5 / 15 min |

- **Reports:** one *open* (PENDING) report per reporter per target (note, block or user); a duplicate gets 409. Once an admin resolves it, the user can report again. This is an application check, not a database constraint, so two truly simultaneous requests can both pass it; the rate limit bounds that. The database constraint is Phase 4.
- **Paystack `initialize`:** rate limit only. Reusing an active checkout would need a new "pending checkout" table, which I didn't add.
- New `rateLimitResponse()` in `lib/rate-limit.ts` is the shared "over the limit, return 429" step. Your existing `checkRateLimit` (Phase 1's atomic version) does the counting.
- The numbers besides the four you approved (block, course, avatar, password) are my choices; they're constants at the top of each edit.

## Not done in this phase
- **Self-purchase block** (a scribe buying their own note): you didn't confirm it, so it isn't in. It's one line in `payments/initialize` if you want it.
- **Dependency audit:** needs network. Run `npm audit --omit=dev` and `npm audit` on your machine, and check `pdfjs-dist` is on 4.10.38 (`package.json` says `^4.0.0`; the lockfile decides). Versions before 4.2.67 have CVE-2024-4367.
- Error-message leakage (the upload route still returns `Upload failed: ${message}`), login timing and signup enumeration are Phase 3.

## Not verified — please read
No `npm install`, `tsc`, database or Cloudinary here (no network). Changed files pass a TypeScript **syntax** check, and the pure logic (`mapLimit`, `withTimeout`, fingerprint, similarity) passed its tests here through a small shim. The vitest files `lib/async-limits.test.ts` and `lib/quality-check.test.ts` are included. **Not run:** full type-check, the routes, and pdf.js rendering.
Please run `npx prisma generate && npx tsc --noEmit && npm test`, then try by hand:
1. Upload a normal PDF, then a PDF with a huge page size, then 11 uploads in an hour.
2. Upload the same PDF twice under two different block titles (the second should be flagged as a 100% match).
3. Open a note, and hit `all-pages` 21 times.
4. File the same report twice.

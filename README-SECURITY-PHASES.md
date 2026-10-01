# Veloce security fixes — phases 1 to 7 (complete)

Unzip over the project root. Files are merged in phase order, so where several phases touched the same file you get the newest version.
`prisma/schema.prisma` is already merged (session version, text hash, admin two-step fields, PollVote copy fields, SecurityEvent, SecurityLogLock) — no manual schema edits.
Per-phase notes are in `docs/security/`.

## Deploy
1. Check your Vercel environment variables first (Project → Settings → Environment Variables) (Phase 4): `JWT_SECRET` must be 32+ characters and every variable in `lib/env.ts` must exist, or production refuses to start.
2. `npx prisma generate && npx tsc --noEmit && npm test`
3. Deploy (the build runs `prisma migrate deploy`; 6 new migrations).
4. Run once: `scripts/migrate-note-files-to-private.js` (dry run, then `--commit`), `scripts/backfill-note-text-hash.ts`, `scripts/clean-orphan-note-files.js` (dry run first).
5. Then run `npx prisma migrate dev` locally once and confirm it proposes NO new migration (Phase 4 database constraints).

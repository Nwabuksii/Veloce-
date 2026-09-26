# Everything built this round

## Schema (prisma/schema.prisma + new migration)
- Note.scribeLevelAtUpload — permanent snapshot of the scribe's level when
  they uploaded that specific version.
- User.graduatedAt — set once a scribe is advanced past 500L; gates new
  uploads/block-creation only, role stays SCRIBE, old notes keep earning.
- University.lastLevelAdvanceAt — locks the admin "start new level" action
  to once per May/July window.
- University.wentLocalAt, User.catalogScope (nullable OWN/ALL enum) —
  UNUSED FOR NOW. Schema-only prep for the future multi-university scope
  feature, so that launch won't need its own migration.

Run: npx prisma migrate deploy && npx prisma generate (or migrate dev
locally), after pulling these files in.

## 1. Scribe upload/block-creation locked to own university
- app/api/scribe/upload/route.ts, app/api/scribe/blocks/route.ts — both
  now reject if the target block/course belongs to a different
  university, and both reject if the scribe has graduated.

## 2. Report routing — flipped to the reported party's university
- lib/report-scope.ts (new) — shared "who owns this report" helper.
- app/api/admin/reports/route.ts, .../[id]/resolve/route.ts,
  app/api/admin/purchases/[id]/refund/route.ts — now scope by the
  reported/content-owning university, not the reporter's/buyer's.
- app/api/notes/[id]/report, app/api/blocks/[id]/report,
  app/api/users/[id]/report — no longer block filing a cross-university
  report; routing to the right admin happens in the routes above.

## 3. Per-version purchase counts
- app/api/blocks/[id]/notes/route.ts — sales now also grouped by noteId
  (kept the existing scribe-wide count too, for the trust badge).

## 4. University + scribe-level labels
- app/api/blocks/[id]/notes/route.ts, app/api/blocks/route.ts — now
  return universityName and each note's scribeLevelAtUpload.
- app/blocks/[id]/page.tsx — shows university in the block header, level
  badge + "N bought" on every version row.
- app/dashboard/page.tsx — shows university + scribe's level on catalog
  cards.

## 5. Profile display
- app/api/account/route.ts — now also returns university name.
- app/settings/page.tsx — Account tab shows name/school/department/level.

## 6/7. Admin "start new level" + graduation
- app/api/admin/university/advance-level/route.ts (new) — GET for status,
  POST to run it. May/July only, once per window, advances everyone,
  graduates anyone at 500L.
- app/admin/users/page.tsx — new panel with the trigger button, status
  text, and a confirm() dialog before running (this affects every user at
  the university at once).

Nothing from the bigger deferred items (super-admin tier, cross-university
catalog opening, the scope/filter UI itself) was touched — only the
schema prep noted above.

# Changed files, this round

1. app/purchases/page.tsx ("My Library")
   - The block title on each purchased-note card is now a link to
     `/blocks/{blockId}?note={noteId}` — the specific scribe's version
     you bought, sorted to the top of that block's note list and
     visually highlighted (reusing the existing "Shared with you"
     mechanism that block page already had for shared links).

2. app/api/student/purchases/route.ts
   - Added `blockId` to the response — the frontend needs it to build
     the link above; it wasn't being sent before.

3. app/admin/users/page.tsx + app/globals.css — "Details" modal on mobile
   - Previous fix used a CSS `order: -1` trick to move the Close button,
     which was the likely cause of the header content not showing
     correctly on your device.
   - Rebuilt it more simply: the name/status/email block is now in
     plain, normal document flow (impossible to accidentally hide), and
     the Close button is `position: absolute` in the header's top-right
     corner, completely out of the way of that content, at every screen
     size.

(Avatar.tsx / ProfileMenu.tsx are included again since they're part of
the same globals.css this builds on — no further changes to them this
round beyond what you already have.)

# Changed files

1. app/globals.css
   - Fixed `.avatar-image { width: inherit; height: inherit; }` — `inherit`
     pulls from the PARENT element, not from `.avatar`/`.avatar-sm` on the
     same tag, so any avatar with a photo rendered at its natural
     (uploaded) size instead of the intended circle. This is why the
     scribe avatar on the block page looked huge, and the header one
     only looked fine by accident (a higher-specificity `.avatar-btn
     .avatar` rule was masking the bug there). Now avatars size correctly
     everywhere.
   - Added `.avatar-tap`, `.avatar-lightbox*` — styles for the new
     tap-to-view-photo feature.
   - Added `.admin-user-modal*`, `.admin-user-stat-*`,
     `.admin-user-detail-grid` — the admin "Details" panel now has a real
     mobile layout (bottom-sheet style, 2-column stat grid, wrapping
     header with the Close button pinned top-right) instead of relying on
     a plain flex row with no wrap handling.

2. app/components/Avatar.tsx
   - Tapping any avatar that has an actual photo now opens a full-screen
     viewer (dark backdrop, tap or Escape to close) — like WhatsApp.
     Avatars showing only initials are unaffected (nothing to enlarge).
   - New optional prop `enlargeOnTap` (default true) to opt an avatar out
     of this when it's already nested in its own clickable control.

3. app/components/ProfileMenu.tsx
   - Passes `enlargeOnTap={false}` on the header avatar, since it already
     lives inside the account-menu toggle button — keeps that click
     opening the menu, as before.

4. app/admin/users/page.tsx
   - "Details" modal now uses the new CSS classes above instead of inline
     styles, so it gets a proper mobile layout at ≤640px width.

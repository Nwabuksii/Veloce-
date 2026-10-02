// Accounts removed with scripts/delete-user.js keep their row (so purchases,
// reviews and earnings stay correct) but get a placeholder name and a
// non-routable email on this domain.
export const DELETED_EMAIL_DOMAIN = "deleted.invalid";

export const isDeletedEmail = (email: string | null | undefined): boolean =>
  !!email && email.toLowerCase().endsWith(`@${DELETED_EMAIL_DOMAIN}`);

// For admin screens: show the placeholder email as text, not the raw id.
export const displayEmail = (email: string): string => (isDeletedEmail(email) ? "email removed" : email);

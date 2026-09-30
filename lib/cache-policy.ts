// Cache classes for API responses.
//
// Every API route in Veloce is behind a login (or is a POST/webhook), so the
// only class that exists today is "private": personalised, admin and
// financial data, purchased notes and blocking-message state must never be
// stored by a browser, proxy or CDN and handed to someone else (or to the
// same person after their access changed). requireRole (lib/session.ts)
// applies this to every response that doesn't set its own Cache-Control.
// If a genuinely public, cacheable endpoint is ever added, give it its own
// explicit header instead of relying on this default.
export const NO_STORE = "private, no-store, no-cache, must-revalidate";

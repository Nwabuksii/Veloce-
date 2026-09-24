// Shared across the catalog filter (app/dashboard), signup, and the
// academic-profile onboarding modal — one canonical list so they can never
// drift apart.
export const LEVELS = ["100L", "200L", "300L", "400L", "500L"] as const;
export type Level = (typeof LEVELS)[number];

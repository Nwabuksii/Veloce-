// The one dedicated inbox for all "contact us" / "email us if this is
// wrong" moments across the app — the Settings page's Contact tab, and
// the "if you think this is a mistake" line in ban emails. Deliberately a
// single fixed address rather than looking up whichever admin happens to
// exist, since a dedicated support inbox is what a real user expects to
// reach, not one specific person's personal email.
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "velocenotes@outlook.com";

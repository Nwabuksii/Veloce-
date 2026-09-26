// Which university's admins have authority to act on a given report —
// always the university of whoever/whatever is being reported, never the
// reporter's own university. See app/api/admin/reports/route.ts for the
// full reasoning; this is the single-report version of that same rule,
// used once a specific report is already in hand (e.g. the resolve route)
// rather than filtering a list of many.
export function reportOwnerUniversityId(report: {
  type: string;
  noteId: string | null;
  reportedUser: { universityId: string } | null;
  note: { scribe: { universityId: string } } | null;
  block: { course: { department: { universityId: string } } } | null;
}): string | null {
  if (report.type === "USER") return report.reportedUser?.universityId ?? null;
  if (report.noteId) return report.note?.scribe.universityId ?? null;
  return report.block?.course.department.universityId ?? null;
}

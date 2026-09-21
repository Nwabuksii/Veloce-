// Single place for the campus identity shown in the site header/footer.
// Veloce is piloting at Babcock only for now; when a second university
// launches, this is the one file to change (or to feed from the user's
// university once it's part of the session).
export const CAMPUS = { code: "BU", name: "Babcock University" };

// Nigerian academic sessions run roughly September–July, so from September
// onward "2026/27" is current; before that it's still "2025/26".
export function currentSession(now: Date = new Date()): string {
  const year = now.getFullYear();
  const start = now.getMonth() >= 8 ? year : year - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

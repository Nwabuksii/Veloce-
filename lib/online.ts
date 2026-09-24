export function isUserOnline(lastSeenAt: Date | string | null | undefined, minutes = 5): boolean {
  if (!lastSeenAt) return false;

  const seenAt = new Date(lastSeenAt);
  if (Number.isNaN(seenAt.getTime())) return false;

  return Date.now() - seenAt.getTime() <= minutes * 60 * 1000;
}

import { prisma } from "@/lib/prisma";

/**
 * Deliberately simple, DB-backed rate limiter. An in-memory Map would be
 * the "simpler" option on paper, but it would not actually work correctly
 * here: Vercel serverless functions are stateless and can spin up multiple
 * instances, each with its own memory, so an in-memory counter resets
 * constantly and never sees requests handled by a different instance.
 * Every instance shares the same Neon database, so a row there is the only
 * counter that's actually correct across instances — no separate
 * rate-limiting service needed for a pilot at this scale.
 *
 * Fixed-window, not sliding-window or token-bucket — good enough here;
 * anything fancier would be solving a problem this app doesn't have yet.
 *
 * Returns true if the request is allowed, false if the limit was hit.
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const existing = await prisma.rateLimitHit.findUnique({ where: { key } });

  const windowExpired = !existing || now.getTime() - existing.windowStart.getTime() > windowMs;

  if (windowExpired) {
    await prisma.rateLimitHit.upsert({
      where: { key },
      create: { key, count: 1, windowStart: now },
      update: { count: 1, windowStart: now },
    });
    return true;
  }

  if (existing.count >= limit) {
    return false;
  }

  await prisma.rateLimitHit.update({ where: { key }, data: { count: { increment: 1 } } });
  return true;
}

/** Builds a per-IP rate-limit key. Falls back to "unknown" if no forwarded IP
 * header is present (e.g. local dev) — that just means local dev shares one
 * bucket, which is fine since it's never internet-facing. */
export function ipKeyFrom(req: Request, bucket: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return `${bucket}:${ip}`;
}

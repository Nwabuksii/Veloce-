// Two tiny helpers for keeping expensive work bounded. Plain TypeScript, no
// dependency — used by PDF rendering and the upload checks.

/**
 * Like Promise.all(items.map(fn)), but never runs more than `limit` calls at
 * once. Results keep the input order. After the first failure no NEW item is
 * started (the ones already running finish on their own), so a bad page
 * doesn't leave the other workers grinding through the rest of the document.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;

  const worker = async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index], index);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}

/**
 * Rejects if `promise` hasn't settled within `ms`. This stops WAITING; it
 * cannot stop the underlying work (JavaScript can't cancel a running parse),
 * so callers that hold a cancellable handle should cancel it in their catch.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

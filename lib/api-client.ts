// Wraps fetch() so every page in the app fails the same, user-friendly way
// instead of leaking raw browser/parsing errors ("Failed to fetch",
// "Unexpected token < in JSON at position 0", etc.) straight onto the screen.

export class ApiError extends Error {
  status?: number;
  data?: any;
}

function extractErrorMessage(data: any): string | null {
  if (!data) return null;
  if (typeof data.error === "string") return data.error;

  // zod's .flatten() shape: { formErrors: string[], fieldErrors: {...} }
  if (data.error?.formErrors?.[0]) return data.error.formErrors[0];
  const fieldErrors = data.error?.fieldErrors;
  if (fieldErrors) {
    const firstField = Object.values(fieldErrors).find((v: any) => Array.isArray(v) && v.length);
    if (firstField) return (firstField as string[])[0];
  }
  return null;
}

/**
 * Fetch + parse JSON, but turn every failure mode into a plain, readable
 * ApiError instead of throwing raw network/parsing errors:
 *  - fetch() itself throwing (offline, DNS failure, server unreachable, CORS)
 *  - the server responding with non-JSON (a crash page, a proxy timeout
 *    page, an empty body)
 *  - a normal { error: "..." } / zod-flattened error from the API
 */
export async function apiFetch<T = any>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch {
    const err = new ApiError("No internet connection — check your network and try again.");
    throw err;
  }

  const text = await res.text();
  let data: any = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const err = new ApiError(
        res.ok
          ? "Got an unexpected response from the server — please try again."
          : `Something went wrong (error ${res.status}) — please try again.`
      );
      err.status = res.status;
      throw err;
    }
  }

  if (!res.ok) {
    const message = extractErrorMessage(data) ?? `Something went wrong (error ${res.status}).`;
    const err = new ApiError(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data as T;
}

/** Use in every catch block in place of `err instanceof Error ? err.message : "..."` */
export function friendlyErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;

  if (err instanceof Error) {
    // Catches anything that slipped through without going via apiFetch.
    if (/failed to fetch|networkerror|load failed/i.test(err.message)) {
      return "No internet connection — check your network and try again.";
    }
    if (/unexpected token|is not valid json|json\.parse/i.test(err.message)) {
      return "Something went wrong on our end — please try again.";
    }
    return err.message;
  }

  return "Something went wrong — please try again.";
}

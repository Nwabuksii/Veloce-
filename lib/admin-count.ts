import { apiFetch } from "@/lib/api-client";

export interface AdminCounts {
  applications: number;
  appeals: number;
  moderation: number;
  reports: number;
  payouts: number;
  disputes: number;
  demotedScribes: number;
  feedback: number;
  total: number;
}

/**
 * Fetches pending-action counts for every admin section.
 * Used by both the admin hub page and the ProfileMenu's "Admin panel"
 * badge. Caller is responsible for only calling this when the current
 * user is an ADMIN — the endpoint itself also enforces this.
 *
 * Fails soft: on any error, returns all-zero counts so the UI simply
 * renders no badges rather than throwing on a decorative fetch.
 */
export async function fetchAdminCounts(): Promise<AdminCounts> {
  try {
    return await apiFetch<AdminCounts>("/api/admin/counts");
  } catch {
    return {
      applications: 0,
      appeals: 0,
      moderation: 0,
      reports: 0,
      payouts: 0,
      disputes: 0,
      demotedScribes: 0,
      feedback: 0,
      total: 0,
    };
  }
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { badgeTitle } from "@/lib/badges";
import PageHeader from "@/app/components/PageHeader";
import BadgeShield from "@/app/components/BadgeShield";
import BadgeSlots, { type SlotBadge } from "@/app/components/BadgeSlots";
import { SkeletonList } from "@/app/components/Skeleton";
import "@/app/components/badges.css";

type BadgeItem = SlotBadge & { pinned: boolean };
interface BadgesResponse {
  isSelf: boolean;
  maxPinned: number;
  badges: BadgeItem[];
}

// Scribes only: every badge you have won, and which ones (up to 5) your public
// profile shows. The endpoints already exist (GET /api/scribe/:me/badges and
// POST /api/badges/:id/pin); this page is just the place for them.
export default function MyBadgesPage() {
  const router = useRouter();
  const [data, setData] = useState<BadgesResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback((id: string) => {
    apiFetch<BadgesResponse>(`/api/scribe/${id}/badges`)
      .then(setData)
      .catch((err) => setError(friendlyErrorMessage(err)));
  }, []);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
      return;
    }
    if (user.role !== "SCRIBE") {
      router.replace("/badges");
      return;
    }
    load(user.id);
  }, [router, load]);

  async function setPinned(badge: BadgeItem, next: boolean) {
    setBusy(badge.id);
    try {
      await apiFetch(`/api/badges/${badge.id}/pin`, { method: "POST", body: JSON.stringify({ pinned: next }) });
      setData((d) => (d ? { ...d, badges: d.badges.map((b) => (b.id === badge.id ? { ...b, pinned: next } : b)) } : d));
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const pinned = data?.badges.filter((b) => b.pinned) ?? [];
  const full = !!data && pinned.length >= data.maxPinned;

  return (
    <div className="page-wrap">
      <PageHeader eyebrow="Scribe · Badges" title="My" accent="badges" subtitle="Pick the badges your profile shows and see everything you have won.">
        <Link href="/badges" className="btn btn-ghost">
          How to earn badges
        </Link>
      </PageHeader>

      {!data && !error && <SkeletonList rows={3} />}
      {error && <div className="auth-error">{error}</div>}

      {data && (
        <>
          <div className="panel mb-24">
            <h2 className="panel-title">Shown on your profile</h2>
            <p className="panel-desc">
              {pinned.length}/{data.maxPinned} slots used. Others see these on your profile. Tap × to remove one.
            </p>
            <BadgeSlots badges={pinned} max={data.maxPinned} onRemove={(b) => setPinned(b as BadgeItem, false)} busyId={busy} />
          </div>

          <div className="panel mb-24">
            <h2 className="panel-title">Badges you have won</h2>
            {data.badges.length === 0 ? (
              <p className="panel-desc" style={{ margin: 0 }}>
                No badges yet. Rank in the top 3 on the leaderboard when a semester ends and they will show up here. <Link href="/badges">See how to earn them</Link>
              </p>
            ) : (
              <div className="badge-row">
                {data.badges.map((b) => (
                  <div key={b.id} className={`badge-card${b.pinned ? " is-pinned" : ""}`}>
                    <BadgeShield badgeKey={b.badgeKey} periodType={b.periodType} periodKey={b.periodKey} size={88} />
                    <div className="badge-card-name">{badgeTitle(b.badgeKey)}</div>
                    <button
                      className={`btn btn-sm ${b.pinned ? "btn-ghost" : "btn-primary"}`}
                      disabled={busy === b.id || (!b.pinned && full)}
                      title={!b.pinned && full ? `Remove one first (max ${data.maxPinned})` : undefined}
                      onClick={() => setPinned(b, !b.pinned)}
                    >
                      {b.pinned ? "Remove" : "Show on profile"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { badgeTitle } from "@/lib/badges";
import { Icon } from "@/app/components/icons";
import BadgeShield from "@/app/components/BadgeShield";
import "./badges.css";

interface BadgeItem {
  id: string;
  badgeKey: string;
  periodType: "ALL_TIME" | "SEMESTER" | "YEAR";
  periodKey: string;
  pinned: boolean;
}

interface BadgesResponse {
  isSelf: boolean;
  maxPinned: number;
  badges: BadgeItem[];
}

// The badges section of a scribe's profile. Visitors see the pinned badges;
// the scribe sees the whole trophy case and can pin / unpin (up to 5).
export default function ScribeBadges({ scribeId }: { scribeId: string }) {
  const [data, setData] = useState<BadgesResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<BadgesResponse>(`/api/scribe/${scribeId}/badges`)
      .then((d) => !cancelled && setData(d))
      .catch(() => {}); // badges are a bonus — never break the profile over them
    return () => {
      cancelled = true;
    };
  }, [scribeId]);

  if (!data) return null;
  const { isSelf, maxPinned, badges } = data;
  const pinned = badges.filter((b) => b.pinned);
  if (!isSelf && pinned.length === 0) return null;

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

  const shield = (b: BadgeItem, size: number) => <BadgeShield badgeKey={b.badgeKey} periodType={b.periodType} periodKey={b.periodKey} size={size} />;

  return (
    <div className="panel mb-24">
      <h2 className="panel-title">{Icon.trophy()} Badges</h2>

      {!isSelf ? (
        <div className="badge-row">
          {pinned.map((b) => (
            <div key={b.id}>{shield(b, 96)}</div>
          ))}
        </div>
      ) : badges.length === 0 ? (
        <p className="panel-desc" style={{ margin: 0 }}>
          No badges yet. Rank in the top 3 on the leaderboard when a semester ends and they will show up here.{" "}
          <Link href="/badges">See how to earn them</Link>
        </p>
      ) : (
        <>
          <p className="panel-desc">
            Pin up to {maxPinned} to show on your public profile ({pinned.length}/{maxPinned} pinned).{" "}
            <Link href="/badges">See every badge and how to earn it</Link>
          </p>
          {pinned.length > 0 && (
            <>
              <div className="badge-sub">Pinned</div>
              <div className="badge-row">
                {pinned.map((b) => (
                  <div key={b.id}>{shield(b, 96)}</div>
                ))}
              </div>
            </>
          )}
          <div className="badge-sub">Trophy case</div>
          <div className="badge-row">
            {badges.map((b) => (
              <div key={b.id} className={`badge-card${b.pinned ? " is-pinned" : ""}`}>
                {shield(b, 88)}
                <div className="badge-card-name">{badgeTitle(b.badgeKey)}</div>
                <button
                  className={`btn btn-sm ${b.pinned ? "btn-ghost" : "btn-primary"}`}
                  disabled={busy === b.id || (!b.pinned && pinned.length >= maxPinned)}
                  title={!b.pinned && pinned.length >= maxPinned ? `Unpin one first (max ${maxPinned})` : undefined}
                  onClick={() => setPinned(b, !b.pinned)}
                >
                  {b.pinned ? "Unpin" : "Pin"}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { Icon } from "@/app/components/icons";
import BadgeSlots, { type SlotBadge } from "@/app/components/BadgeSlots";
import "./badges.css";

interface BadgesResponse {
  isSelf: boolean;
  maxPinned: number;
  badges: (SlotBadge & { pinned: boolean })[];
}

// The badges section of a scribe's public profile: the badges they chose to
// show, with a shadow for every slot they have not filled. Choosing and
// viewing every badge won lives on /scribe/badges (scribes only).
export default function ScribeBadges({ scribeId }: { scribeId: string }) {
  const [data, setData] = useState<BadgesResponse | null>(null);

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
  const pinned = data.badges.filter((b) => b.pinned);

  return (
    <div className="panel mb-24">
      <h2 className="panel-title">{Icon.trophy()} Badges</h2>
      <p className="panel-desc">
        {data.isSelf ? (
          <>
            This is how your profile shows your badges ({pinned.length}/{data.maxPinned} slots used). <Link href="/scribe/badges">Choose which to show</Link>
          </>
        ) : (
          <>
            Showing {pinned.length} of {data.maxPinned} slots. <Link href="/badges">How badges are earned</Link>
          </>
        )}
      </p>
      <BadgeSlots badges={pinned} max={data.maxPinned} />
    </div>
  );
}

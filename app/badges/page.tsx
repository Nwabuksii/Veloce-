"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import { BADGE_CATALOGUE, badgeGuide } from "@/lib/badge-guide";
import BadgeShield from "@/app/components/BadgeShield";
import Link from "next/link";
import "@/app/components/badges.css";
import "./badges-page.css";

// Every badge on Veloce and how to earn it. Tap a badge for the details.
// Badges are never uploaded or claimed: they are handed out automatically
// when a semester or academic year ends. Scribes get a link to My badges (/scribe/badges) at the top.
export default function BadgesPage() {
  const router = useRouter();
  const [scribeId, setScribeId] = useState<string | null>(null);
  const [open, setOpen] = useState<{ key: string; datePill: string } | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
      return;
    }
    if (user.role === "SCRIBE") setScribeId(user.id);
  }, [router]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const guide = open ? badgeGuide(open.key) : null;

  return (
    <div className="page-wrap student-page">
      <div className="app-container student-app-container">
        <section className="page-view is-active">
          <div className="page-header">
            <div className="page-header-left">
              <span className="eyebrow">Scribes</span>
              <h1>
                Badges <span className="serif">&amp; how to earn them</span>
              </h1>
              <p>Badges are handed out automatically when a semester or academic year ends. There is nothing to upload or claim.</p>
            </div>
          </div>

          {scribeId && (
            <div className="notice mb-24">
              Want to choose which badges your profile shows? <Link href="/scribe/badges">Go to My badges</Link>
            </div>
          )}

          {BADGE_CATALOGUE.map((group) => (
            <div key={group.title} className="panel mb-24">
              <h2 className="panel-title">{group.title}</h2>
              <p className="panel-desc">{group.blurb} Tap a badge to see how to earn it.</p>
              <div className="bg-designs">
                {group.designs.map((d) => (
                  <div key={d.name} className="bg-design">
                    <div className="bg-design-name">{d.name}</div>
                    <div className="bg-design-row">
                      {d.keys.map((key) => (
                        <button key={key} type="button" className="bg-badge-btn" onClick={() => setOpen({ key, datePill: d.datePill })} aria-label={`How to earn: ${badgeGuide(key)?.title ?? d.name}`}>
                          <BadgeShield badgeKey={key} periodType="SEMESTER" periodKey="" size={74} datePill={d.datePill} />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>

      {open && guide && (
        <div className="bg-overlay" onClick={() => setOpen(null)} role="dialog" aria-modal="true" aria-label={guide.title}>
          <div className="bg-sheet" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn btn-sm btn-ghost bg-close" onClick={() => setOpen(null)}>
              Close
            </button>
            <div className="bg-sheet-art">
              <BadgeShield badgeKey={open.key} periodType="SEMESTER" periodKey="" size={120} datePill={open.datePill} />
            </div>
            <h3 className="bg-sheet-title">{guide.title}</h3>
            <p className="bg-sheet-summary">{guide.summary}</p>

            <div className="bg-sheet-h">How to earn it</div>
            <ul className="bg-sheet-list">
              {guide.how.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>

            <div className="bg-sheet-h">When you get it</div>
            <p className="bg-sheet-p">{guide.when}</p>

            <div className="bg-sheet-h">The date on it</div>
            <p className="bg-sheet-p">{guide.label}</p>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import PageHeader from "@/app/components/PageHeader";
import Avatar from "@/app/components/Avatar";
import { SkeletonList } from "@/app/components/Skeleton";
import { friendlyErrorMessage, apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { Icon } from "@/app/components/icons";

interface ProfileBlock {
  noteId: string;
  blockId: string;
  blockTitle: string;
  courseCode: string;
  courseName: string;
  price: number;
  owned: boolean;
}

interface Profile {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  joinedAt: string;
  schoolName: string;
  currentLevel: string;
  isActiveScribe: boolean;
  paidSubscriberCount: number;
  followerCount: number;
  totalSales: number;
  avgRating: number | null;
  ratingCount: number;
  trustLevel: "NEW" | "RISING" | "TRUSTED" | "ELITE";
  trustLabel: string;
  isFollowing: boolean;
  isSelf: boolean;
  blocks: ProfileBlock[];
}

const naira = (n: number) => `₦${n.toLocaleString()}`;

export default function ScribeProfilePage() {
  const router = useRouter();
  const params = useParams();
  const scribeId = params.id as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [followLoading, setFollowLoading] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportStatus, setReportStatus] = useState("");
  const [noteSearch, setNoteSearch] = useState("");
  const [noteSort, setNoteSort] = useState<"recent" | "title" | "price">("recent");

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
      return;
    }

    fetch(`/api/scribe/${scribeId}/profile`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load profile");
        setProfile(data.profile);
      })
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [router, scribeId]);

  async function toggleFollow() {
    if (!profile) return;
    setFollowLoading(true);
    try {
      const res = await fetch(`/api/scribe/${scribeId}/follow`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update follow status");

      setProfile((prev) => (prev ? { ...prev, isFollowing: data.following, followerCount: data.followerCount } : prev));
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setFollowLoading(false);
    }
  }

  async function submitReport() {
    setReportStatus("");
    if (reportReason.trim().length < 10) {
      setReportStatus("Tell us a bit more — at least 10 characters.");
      return;
    }
    setReportSubmitting(true);
    try {
      await apiFetch(`/api/users/${scribeId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reportReason.trim() }),
      });
      setReportStatus("Report submitted — an admin will take a look.");
      setReportReason("");
      setReporting(false);
    } catch (err) {
      setReportStatus(friendlyErrorMessage(err));
    } finally {
      setReportSubmitting(false);
    }
  }

  const visibleBlocks = useMemo(() => {
    if (!profile) return [];
    const q = noteSearch.trim().toLowerCase();
    const filtered = q
      ? profile.blocks.filter(
          (b) =>
            b.blockTitle.toLowerCase().includes(q) ||
            b.courseName.toLowerCase().includes(q) ||
            b.courseCode.toLowerCase().includes(q)
        )
      : profile.blocks;

    // API returns createdAt desc already, so "recent" needs no re-sort.
    if (noteSort === "title") return [...filtered].sort((a, b) => a.blockTitle.localeCompare(b.blockTitle));
    if (noteSort === "price") return [...filtered].sort((a, b) => a.price - b.price);
    return filtered;
  }, [profile, noteSearch, noteSort]);

  return (
    <div className="page-wrap">
      <PageHeader eyebrow="Scribe · Profile" title="Scribe" accent="profile" subtitle="Ratings, followers and every live note this scribe has published.">
        <button className="btn btn-ghost" onClick={() => router.back()}>
          {Icon.back()} Back
        </button>
      </PageHeader>

      {loading && <SkeletonList rows={3} />}
      {error && <div className="auth-error">{error}</div>}

      {profile && (
        <>
          <div className="panel mb-24">
            <div className="profile-head">
              <div className="profile-avatar">
                <Avatar name={profile.fullName} imageUrl={profile.avatarUrl} />
              </div>

              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <div className="flex-between">
                  <div style={{ minWidth: 0 }}>
                    <h2 className="profile-name">{profile.fullName}</h2>
                    <div className="chip-row">
                      <span className={`chip tier-${profile.trustLevel.toLowerCase()}`}>
                        {Icon.shield()} {profile.trustLabel}
                      </span>
                      <span className="chip">{Icon.compass()} {profile.schoolName}</span>
                      <span className="chip">{Icon.book()} {profile.currentLevel}</span>
                      {!profile.isActiveScribe && <span className="chip is-danger">No longer an active scribe</span>}
                    </div>
                  </div>

                  <div className="header-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!profile.isSelf && profile.isActiveScribe && (
                      <button
                        className={`btn ${profile.isFollowing ? "btn-ghost" : "btn-primary"}`}
                        onClick={toggleFollow}
                        disabled={followLoading}
                      >
                        {Icon.user()} {profile.isFollowing ? "Following" : "Follow scribe"}
                      </button>
                    )}
                    {!profile.isSelf && (
                      <button className="btn btn-ghost" onClick={() => setReporting((v) => !v)}>
                        {Icon.flag()} Report
                      </button>
                    )}
                  </div>
                </div>

                {reporting && (
                  <div style={{ marginTop: 18 }}>
                    <div className="form-field">
                      <label className="form-label" htmlFor="report">
                        Why are you reporting {profile.fullName}?
                      </label>
                      <textarea
                        id="report"
                        className="textarea"
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                        rows={3}
                        placeholder="Harassment, scam, fake notes, etc. — describe what happened..."
                      />
                    </div>
                    <div className="flex-end" style={{ marginTop: 0, paddingTop: 12 }}>
                      <button className="btn btn-quiet" onClick={() => setReporting(false)}>
                        Cancel
                      </button>
                      <button className="btn btn-primary" onClick={submitReport} disabled={reportSubmitting}>
                        {reportSubmitting ? "Submitting..." : "Submit report"}
                      </button>
                    </div>
                  </div>
                )}
                {reportStatus && (
                  <p className="panel-desc" style={{ margin: "12px 0 0", color: reporting ? "var(--text-danger)" : "var(--text-success)" }}>
                    {reportStatus}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="three-col mb-24">
            <div className="stat-card">
              <div className="label">Overall rating</div>
              <div className="value">{profile.avgRating != null ? profile.avgRating.toFixed(1) : "—"}</div>
              <span className="delta flat">{Icon.star()} {profile.ratingCount} verified review{profile.ratingCount === 1 ? "" : "s"}</span>
            </div>
            <div className="stat-card">
              <div className="label">Paid buyers</div>
              <div className="value">{profile.paidSubscriberCount}</div>
              <span className="delta flat">{Icon.check()} scholars</span>
            </div>
            <div className="stat-card">
              <div className="label">Followers</div>
              <div className="value">{profile.followerCount}</div>
              <span className="delta flat">{Icon.users()} following</span>
            </div>
            <div className="stat-card">
              <div className="label">Authored blocks</div>
              <div className="value">{profile.blocks.length}</div>
              <span className="delta flat">{Icon.book()} live packs</span>
            </div>
          </div>

          <h2 className="panel-title section-title">{Icon.book()} Live notes</h2>

          {profile.blocks.length > 0 && (
            <div className="filter-bar" style={{ marginBottom: 16 }}>
              <div className="search-field">
                {Icon.search()}
                <input
                  type="search"
                  value={noteSearch}
                  onChange={(e) => setNoteSearch(e.target.value)}
                  placeholder="Search this scribe's notes..."
                  aria-label="Search this scribe's notes"
                />
              </div>
              <div className="filter-selects">
                <select
                  className="select-plain"
                  value={noteSort}
                  onChange={(e) => setNoteSort(e.target.value as typeof noteSort)}
                  aria-label="Sort notes"
                >
                  <option value="recent">Most recent</option>
                  <option value="title">Title (A–Z)</option>
                  <option value="price">Price (low to high)</option>
                </select>
              </div>
            </div>
          )}

          {profile.blocks.length === 0 && (
            <div className="panel">
              <div className="empty-state">No live notes yet.</div>
            </div>
          )}
          {profile.blocks.length > 0 && visibleBlocks.length === 0 && (
            <div className="panel">
              <div className="empty-state">No notes match your search.</div>
            </div>
          )}

          <div>
            {visibleBlocks.map((b) => (
              <div key={b.noteId} className="data-row data-row--tx" style={{ cursor: "pointer" }} onClick={() => router.push(`/blocks/${b.blockId}`)}>
                <div>
                  <div className="row-code">{b.courseCode}</div>
                  <div className="row-title">{b.blockTitle}</div>
                  <div className="row-meta">{b.courseName}</div>
                </div>
                <div className="row-stat" data-label="Price">
                  {b.owned ? <span className="status paid">Owned</span> : <strong>{naira(b.price)}</strong>}
                </div>
                <div className="row-actions">
                  {b.owned ? (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/notes/${b.noteId}/read`);
                      }}
                    >
                      {Icon.book()} Read
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/blocks/${b.blockId}`);
                      }}
                    >
                      {Icon.lock()} Instant unlock
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

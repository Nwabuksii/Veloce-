"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import Avatar from "@/app/components/Avatar";
import { friendlyErrorMessage, apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/toast";

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

const TRUST_STYLES: Record<Profile["trustLevel"], { bg: string; color: string }> = {
  NEW: { bg: "var(--bg-info)", color: "var(--text-secondary)" },
  RISING: { bg: "var(--bg-warning)", color: "var(--text-warning)" },
  TRUSTED: { bg: "var(--bg-success)", color: "var(--text-success)" },
  ELITE: { bg: "var(--bg-pro)", color: "var(--text-pro)" },
};

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
      <div className="app-container" style={{ maxWidth: 960 }}>
        <div className="top-bar">
          <div className="logo" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Logo size={34} />
            <div>
              <h1>
                Veloce <span className="accent">.</span>
              </h1>
              <div className="logo-sub">Scribe profile</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="btn" onClick={() => router.back()}>
              <i className="fas fa-arrow-left"></i> Back
            </button>
            <ProfileMenu />
          </div>
        </div>

        {loading && <p style={{ marginTop: "1rem", color: "var(--text-secondary)" }}>Loading profile...</p>}
        {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}

        {profile && (
          <div style={{ marginTop: "1.5rem" }}>
            <div style={{ display: "flex", gap: "1.1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ transform: "scale(1.7)", transformOrigin: "top left", marginRight: "0.6rem" }}>
                <Avatar name={profile.fullName} imageUrl={profile.avatarUrl} />
              </div>

              <div style={{ flex: "1 1 260px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                  <div>
                    <h2 style={{ fontSize: "1.5rem" }}>{profile.fullName}</h2>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          background: TRUST_STYLES[profile.trustLevel].bg,
                          color: TRUST_STYLES[profile.trustLevel].color,
                          padding: "0.3rem 0.9rem",
                          borderRadius: "999px",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                        }}
                      >
                        <i className="fas fa-shield-alt"></i> {profile.trustLabel}
                      </span>
                      {!profile.isActiveScribe && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            background: "var(--bg-danger)",
                            color: "var(--text-danger)",
                            padding: "0.3rem 0.9rem",
                            borderRadius: "999px",
                            fontSize: "0.78rem",
                            fontWeight: 700,
                          }}
                        >
                          No longer an active scribe
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.6rem" }}>
                    {!profile.isSelf && profile.isActiveScribe && (
                      <button
                        className={`btn ${profile.isFollowing ? "" : "btn-primary"}`}
                        onClick={toggleFollow}
                        disabled={followLoading}
                      >
                        <i className={`fas ${profile.isFollowing ? "fa-user-check" : "fa-user-plus"}`}></i>{" "}
                        {profile.isFollowing ? "Following" : "Follow Scribe"}
                      </button>
                    )}
                    {!profile.isSelf && (
                      <button className="btn" onClick={() => setReporting((v) => !v)}>
                        <i className="fas fa-flag"></i> Report
                      </button>
                    )}
                  </div>
                </div>

                {reporting && (
                  <div style={{ marginTop: "1rem", background: "var(--surface)", border: "1px solid var(--border-blue)", borderRadius: "10px", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                    <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      Why are you reporting {profile.fullName}? (harassment, scam, fake notes, etc.)
                    </label>
                    <textarea
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                      rows={3}
                      placeholder="Describe what happened..."
                      style={{ padding: "0.6rem", borderRadius: "8px", border: "1px solid var(--border-blue)", fontFamily: "inherit", fontSize: "0.85rem" }}
                    />
                    <div style={{ display: "flex", gap: "0.6rem" }}>
                      <button className="btn btn-primary" onClick={submitReport} disabled={reportSubmitting}>
                        {reportSubmitting ? "Submitting..." : "Submit report"}
                      </button>
                      <button className="btn" onClick={() => setReporting(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {reportStatus && !reporting && (
                  <p style={{ color: "var(--text-success)", marginTop: "0.6rem", fontSize: "0.85rem" }}>{reportStatus}</p>
                )}
              </div>
            </div>

            <div className="stat-row">
              <div className="stat-card" style={{ flex: "1 1 180px" }}>
                <div className="stat-label"><i className="fas fa-star" style={{ color: "var(--star)" }}></i> Overall rating</div>
                <div className="stat-value">{profile.avgRating != null ? profile.avgRating.toFixed(1) : "—"}</div>
                <div className="stat-sub">{profile.ratingCount} verified reviews</div>
              </div>
              <div className="stat-card" style={{ flex: "1 1 180px" }}>
                <div className="stat-label"><i className="fas fa-shopping-cart"></i> Paid buyers</div>
                <div className="stat-value">{profile.paidSubscriberCount}</div>
                <div className="stat-sub">scholars</div>
              </div>
              <div className="stat-card" style={{ flex: "1 1 180px" }}>
                <div className="stat-label"><i className="fas fa-users"></i> Followers</div>
                <div className="stat-value">{profile.followerCount}</div>
                <div className="stat-sub">active</div>
              </div>
              <div className="stat-card" style={{ flex: "1 1 180px" }}>
                <div className="stat-label"><i className="fas fa-layer-group"></i> Authored blocks</div>
                <div className="stat-value">{profile.blocks.length}</div>
                <div className="stat-sub">packs</div>
              </div>
            </div>

            <h3 style={{ marginTop: "1.8rem", fontSize: "1.1rem" }}>
              <i className="fas fa-layer-group" style={{ color: "var(--text-info)" }}></i> Live notes
            </h3>

            {profile.blocks.length > 0 && (
              <div style={{ display: "flex", gap: "0.8rem", margin: "0.8rem 0", flexWrap: "wrap" }}>
                <div style={{ position: "relative", flex: "1 1 220px" }}>
                  <i
                    className="fas fa-search"
                    style={{ position: "absolute", left: "0.9rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
                  ></i>
                  <input
                    value={noteSearch}
                    onChange={(e) => setNoteSearch(e.target.value)}
                    placeholder="Search this scribe's notes..."
                    style={{
                      width: "100%",
                      padding: "0.55rem 0.9rem 0.55rem 2.2rem",
                      borderRadius: "40px",
                      border: "1px solid var(--border-blue)",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>
                <select
                  value={noteSort}
                  onChange={(e) => setNoteSort(e.target.value as typeof noteSort)}
                  style={{
                    padding: "0.55rem 1rem",
                    borderRadius: "40px",
                    border: "1px solid var(--border-blue)",
                    fontSize: "0.85rem",
                    background: "var(--surface)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="recent">Most recent</option>
                  <option value="title">Title (A–Z)</option>
                  <option value="price">Price (low to high)</option>
                </select>
              </div>
            )}

            {profile.blocks.length === 0 && (
              <p style={{ color: "var(--text-secondary)", marginTop: "0.6rem" }}>No live notes yet.</p>
            )}
            {profile.blocks.length > 0 && visibleBlocks.length === 0 && (
              <p style={{ color: "var(--text-secondary)", marginTop: "0.6rem" }}>No notes match your search.</p>
            )}

            <div className="ledger-list" style={{ marginTop: "0.8rem" }}>
              {visibleBlocks.map((b) => (
                <div key={b.noteId} className="ledger-row press-on-tap" onClick={() => router.push(`/blocks/${b.blockId}`)} style={{ cursor: "pointer" }}>
                  <span className="seal mono">{b.courseCode}</span>
                  <div className="ledger-row-title" style={{ marginTop: "0.4rem" }}>{b.blockTitle}</div>
                  <div className="ledger-row-meta">{b.courseName}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.6rem", paddingTop: "0.7rem", borderTop: "1px solid var(--border-light)" }}>
                    {b.owned ? (
                      <span className="seal">Owned</span>
                    ) : (
                      <span className="price-tag">₦{b.price.toLocaleString()}</span>
                    )}
                    {b.owned ? (
                      <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); router.push(`/notes/${b.noteId}/read`); }}>
                        <i className="fas fa-book-open"></i> Read
                      </button>
                    ) : (
                      <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); router.push(`/blocks/${b.blockId}`); }}>
                        <i className="fas fa-lock"></i> Instant Unlock
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

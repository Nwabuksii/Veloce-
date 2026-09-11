"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { friendlyErrorMessage, apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/toast";

interface ProfileBlock {
  noteId: string;
  blockId: string;
  blockTitle: string;
  courseCode: string;
  courseName: string;
  price: number;
}

interface Profile {
  id: string;
  fullName: string;
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

  return (
    <div className="page-wrap">
      <div className="app-container" style={{ maxWidth: 720 }}>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h2 style={{ fontSize: "1.5rem" }}>{profile.fullName}</h2>
                <span
                  style={{
                    display: "inline-block",
                    marginTop: "0.4rem",
                    background: TRUST_STYLES[profile.trustLevel].bg,
                    color: TRUST_STYLES[profile.trustLevel].color,
                    padding: "0.25rem 0.9rem",
                    borderRadius: "30px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                  }}
                >
                  <i className="fas fa-shield-alt"></i> {profile.trustLabel}
                </span>
                {!profile.isActiveScribe && (
                  <span
                    style={{
                      display: "inline-block",
                      marginTop: "0.4rem",
                      marginLeft: "0.5rem",
                      background: "var(--bg-danger)",
                      color: "var(--text-danger)",
                      padding: "0.25rem 0.9rem",
                      borderRadius: "30px",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                    }}
                  >
                    No longer an active scribe
                  </span>
                )}
              </div>

              {!profile.isSelf && profile.isActiveScribe && (
                <button
                  className={`btn ${profile.isFollowing ? "" : "btn-primary"}`}
                  onClick={toggleFollow}
                  disabled={followLoading}
                >
                  <i className={`fas ${profile.isFollowing ? "fa-user-check" : "fa-user-plus"}`}></i>{" "}
                  {profile.isFollowing ? "Following" : "Follow"}
                </button>
              )}
              {!profile.isSelf && (
                <button className="btn" onClick={() => setReporting((v) => !v)}>
                  <i className="fas fa-flag"></i> Report user
                </button>
              )}
            </div>

            {reporting && (
              <div style={{ marginTop: "1rem", background: "var(--surface)", border: "1px solid var(--border-blue)", borderRadius: "1rem", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  Why are you reporting {profile.fullName}? (harassment, scam, fake notes, etc.)
                </label>
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  rows={3}
                  placeholder="Describe what happened..."
                  style={{ padding: "0.6rem", borderRadius: "0.6rem", border: "1px solid var(--border-blue)", fontFamily: "inherit", fontSize: "0.85rem" }}
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

            <div style={{ display: "flex", gap: "1rem", margin: "1.2rem 0", flexWrap: "wrap" }}>
              <div className="role-pill">
                <i className="fas fa-shopping-cart"></i> {profile.paidSubscriberCount} paid subscriber
                {profile.paidSubscriberCount === 1 ? "" : "s"}
              </div>
              <div className="role-pill">
                <i className="fas fa-users"></i> {profile.followerCount} follower{profile.followerCount === 1 ? "" : "s"}
              </div>
              <div className="role-pill">
                <i className="fas fa-star" style={{ color: "var(--star)" }}></i>{" "}
                {profile.avgRating != null ? `${profile.avgRating.toFixed(1)} (${profile.ratingCount})` : "No ratings yet"}
              </div>
            </div>

            <h3 style={{ marginTop: "1.5rem", fontSize: "1.1rem" }}>
              <i className="fas fa-layer-group" style={{ color: "var(--text-info)" }}></i> Live notes
            </h3>

            {profile.blocks.length === 0 && (
              <p style={{ color: "var(--text-secondary)", marginTop: "0.6rem" }}>No live notes yet.</p>
            )}

            <div className="card-grid" style={{ marginTop: "0.8rem" }}>
              {profile.blocks.map((b) => (
                <div key={b.noteId} className="block-card" onClick={() => router.push(`/blocks/${b.blockId}`)} style={{ cursor: "pointer" }}>
                  <div className="badge">{b.courseCode}</div>
                  <h3>{b.blockTitle}</h3>
                  <div className="meta">{b.courseName}</div>
                  <span className="price-tag">₦{b.price.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

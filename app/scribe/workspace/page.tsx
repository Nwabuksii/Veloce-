"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, StoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { friendlyErrorMessage } from "@/lib/api-client";

interface ScribeNote {
  id: string;
  status: string;
  blockId: string;
  blockTitle: string;
  courseCode: string;
  courseName: string;
  salesCount: number;
  avgRating: number | null;
  reviewCount: number;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  LIVE: { bg: "var(--bg-success)", color: "var(--text-success)", label: "Live" },
  APPROVED: { bg: "var(--bg-success)", color: "var(--text-success)", label: "Live" },
  FLAGGED: { bg: "var(--bg-warning)", color: "var(--text-warning)", label: "Under review" },
  PENDING_REVIEW: { bg: "var(--bg-warning)", color: "var(--text-warning)", label: "Under review" },
  REJECTED: { bg: "var(--bg-danger)", color: "var(--text-danger)", label: "Rejected" },
};

export default function ScribeWorkspacePage() {
  const router = useRouter();
  const [notes, setNotes] = useState<ScribeNote[]>([]);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = getStoredUser();

    if (!storedUser) {
      router.push("/login");
      return;
    }
    if (storedUser.role !== "SCRIBE" && storedUser.role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }
    setUser(storedUser);

    fetch("/api/scribe/notes")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load your uploads");
        setNotes(data.notes);
      })
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [router]);

  const totalSales = notes.reduce((sum, n) => sum + n.salesCount, 0);

  async function handleCopyLink(blockId: string, noteId: string) {
    const url = `${window.location.origin}/blocks/${blockId}?note=${noteId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(noteId);
    } catch {
      // Clipboard permission denied — nothing to fall back to silently, so
      // just leave the button unlabeled rather than show a raw error.
    }
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="page-wrap">
      <div className="app-container">
        <div className="top-bar">
          <div className="logo" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Logo size={34} />
            <div>
              <h1>
                Veloce <span className="accent">.</span>
              </h1>
              <div className="logo-sub">Scribe workspace</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.8rem", alignItems: "center" }}>
            <button className="btn" onClick={() => router.push(`/scribe/${user?.id}`)}>
              <i className="fas fa-id-badge"></i> My public profile
            </button>
            <button className="btn" onClick={() => router.push("/scribe/earnings")}>
              <i className="fas fa-wallet"></i> Earnings
            </button>
            <button className="btn btn-primary" onClick={() => router.push("/scribe/upload")}>
              <i className="fas fa-plus"></i> Upload new note
            </button>
            <ProfileMenu />
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem", margin: "1.2rem 0", flexWrap: "wrap" }}>
          <div className="role-pill">
            <i className="fas fa-file-alt"></i> {notes.length} upload{notes.length === 1 ? "" : "s"}
          </div>
          <div className="role-pill">
            <i className="fas fa-shopping-cart"></i> {totalSales} total sale{totalSales === 1 ? "" : "s"}
          </div>
        </div>

        {loading && <p style={{ color: "var(--text-secondary)" }}>Loading your uploads...</p>}
        {error && <div className="auth-error">{error}</div>}
        {!loading && !error && notes.length === 0 && (
          <p style={{ color: "var(--text-secondary)" }}>
            You haven't uploaded any notes yet — click "Upload new note" to get started.
          </p>
        )}

        <div className="card-grid">
          {notes.map((n) => {
            const style = STATUS_STYLES[n.status] || STATUS_STYLES.PENDING_REVIEW;
            return (
              <div key={n.id} className="block-card">
                <div className="badge">{n.courseCode}</div>
                <h3>{n.blockTitle}</h3>
                <div className="meta">{n.courseName}</div>

                <span
                  style={{
                    background: style.bg,
                    color: style.color,
                    padding: "0.2rem 0.8rem",
                    borderRadius: "30px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  {style.label}
                </span>

                <div style={{ display: "flex", gap: "1rem", marginTop: "0.9rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  <span>
                    <i className="fas fa-shopping-cart" style={{ color: "var(--text-info)" }}></i> {n.salesCount} bought
                  </span>
                  <span>
                    <i className="fas fa-star" style={{ color: "var(--star)" }}></i>{" "}
                    {n.avgRating != null ? `${n.avgRating.toFixed(1)} (${n.reviewCount})` : "No ratings yet"}
                  </span>
                </div>

                {(n.status === "LIVE" || n.status === "APPROVED") && (
                  <button
                    className="btn"
                    style={{ marginTop: "0.8rem", width: "100%" }}
                    onClick={() => handleCopyLink(n.blockId, n.id)}
                  >
                    <i className="fas fa-link"></i> {copiedId === n.id ? "Copied!" : "Copy share link"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

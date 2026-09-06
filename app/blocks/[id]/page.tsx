"use client";

import { useEffect, useState, FormEvent, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";

interface NoteVersion {
  noteId: string;
  scribeId: string;
  scribeName: string;
  trustLevel: string;
  trustLabel: string;
  noteAvgRating: number | null;
  noteRatingCount: number;
  owned: boolean;
}

const TRUST_STYLES: Record<string, { bg: string; color: string }> = {
  NEW: { bg: "#eef3fa", color: "#5e7188" },
  RISING: { bg: "#fdf3e3", color: "#a5690a" },
  TRUSTED: { bg: "#e7f6ec", color: "#1b7e4a" },
  ELITE: { bg: "#f0e9fb", color: "#6b3fa0" },
};

export function BlockDetailInner() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const blockId = params.id as string;
  const highlightNoteId = searchParams.get("note");

  const [blockTitle, setBlockTitle] = useState("");
  const [price, setPrice] = useState(0);
  const [notes, setNotes] = useState<NoteVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copy link");
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportStatus, setReportStatus] = useState("");
  const [purchasingNoteId, setPurchasingNoteId] = useState<string | null>(null);
  const [reviewsOpenFor, setReviewsOpenFor] = useState<string | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      const here = `${window.location.pathname}${window.location.search}`;
      router.push(`/login?returnTo=${encodeURIComponent(here)}`);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, blockId]);

  function load() {
    setLoading(true);
    apiFetch(`/api/blocks/${blockId}/notes`)
      .then((data) => {
        setBlockTitle(data.blockTitle);
        setPrice(data.price);
        // A shared link points at one specific scribe's version — when
        // that's the case, put it first so the person who followed the
        // link lands directly on it instead of having to find it among
        // however many other scribes also wrote this block.
        const sorted = highlightNoteId
          ? [...data.notes].sort((a: NoteVersion, b: NoteVersion) =>
              a.noteId === highlightNoteId ? -1 : b.noteId === highlightNoteId ? 1 : 0
            )
          : data.notes;
        setNotes(sorted);
      })
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  async function handleCopyLink() {
    const url = `${window.location.origin}/blocks/${blockId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyLabel("Copied!");
    } catch {
      setCopyLabel("Press Ctrl+C to copy");
    }
    setTimeout(() => setCopyLabel("Copy link"), 2000);
  }

  async function handlePurchase(noteId: string) {
    setPurchasingNoteId(noteId);
    try {
      const data = await apiFetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId, noteId }),
      });
      window.location.href = data.authorizationUrl;
    } catch (err) {
      alert(friendlyErrorMessage(err));
      setPurchasingNoteId(null);
    }
  }

  async function handleReportSubmit(e: FormEvent) {
    e.preventDefault();
    setReportStatus("");

    if (reportReason.trim().length < 10) {
      setReportStatus("Tell us a bit more — at least 10 characters.");
      return;
    }

    setReportSubmitting(true);
    try {
      await apiFetch(`/api/blocks/${blockId}/report`, {
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
      <div className="app-container" style={{ maxWidth: 640 }}>
        <div className="top-bar">
          <div className="logo" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Logo size={34} />
            <div>
              <h1>
                Veloce <span className="accent">.</span>
              </h1>
              <div className="logo-sub">Block details</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="btn" onClick={() => router.push("/dashboard")}>
              <i className="fas fa-arrow-left"></i> Dashboard
            </button>
            <ProfileMenu />
          </div>
        </div>

        {loading && <p style={{ marginTop: "1rem", color: "#5e7188" }}>Loading...</p>}
        {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}

        {!loading && !error && (
          <div style={{ marginTop: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.8rem" }}>
              <div>
                <h2 style={{ fontSize: "1.4rem" }}>{blockTitle}</h2>
                <span className="price-tag" style={{ marginTop: "0.4rem", display: "inline-block" }}>
                  ₦{price.toLocaleString()}
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.6rem" }}>
                <button className="btn" onClick={handleCopyLink}>
                  <i className="fas fa-link"></i> {copyLabel}
                </button>
                <button className="btn" onClick={() => setReporting((v) => !v)}>
                  <i className="fas fa-flag"></i> Report
                </button>
              </div>
            </div>

            {reporting && (
              <form onSubmit={handleReportSubmit} style={{ marginTop: "1rem", background: "white", border: "1px solid #e1e8f0", borderRadius: "1rem", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                <label style={{ fontSize: "0.85rem", color: "#5e7188" }}>
                  Why are you reporting this block? (wrong/stolen content, low quality, etc.)
                </label>
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  rows={3}
                  placeholder="Explain what's wrong with this block..."
                  style={{ padding: "0.6rem", borderRadius: "0.6rem", border: "1px solid #d0dae8", fontFamily: "inherit", fontSize: "0.85rem" }}
                />
                <div style={{ display: "flex", gap: "0.6rem" }}>
                  <button className="btn btn-primary" type="submit" disabled={reportSubmitting}>
                    {reportSubmitting ? "Submitting..." : "Submit report"}
                  </button>
                  <button className="btn" type="button" onClick={() => setReporting(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {reportStatus && !reporting && (
              <p style={{ color: "#1b7e4a", marginTop: "0.6rem", fontSize: "0.85rem" }}>{reportStatus}</p>
            )}

            <h3 style={{ marginTop: "1.5rem", fontSize: "1.05rem" }}>
              <i className="fas fa-file-alt" style={{ color: "#2a7de1" }}></i> Available versions
            </h3>

            {notes.length === 0 && (
              <p style={{ color: "#5e7188", marginTop: "0.6rem" }}>No live notes for this block yet.</p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", marginTop: "0.8rem" }}>
              {notes.map((n) => {
                const trustStyle = TRUST_STYLES[n.trustLevel] || TRUST_STYLES.NEW;
                return (
                  <div
                    key={n.noteId}
                    style={{
                      background: n.noteId === highlightNoteId ? "#eef6ff" : "white",
                      border: n.noteId === highlightNoteId ? "2px solid #2a7de1" : "1px solid #e1e8f0",
                      borderRadius: "1rem",
                      padding: "1rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.6rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.6rem" }}>
                    <div>
                      {n.noteId === highlightNoteId && (
                        <div style={{ fontSize: "0.75rem", color: "#2a7de1", fontWeight: 600, marginBottom: "0.2rem" }}>
                          <i className="fas fa-share"></i> Shared with you
                        </div>
                      )}
                      <button
                        onClick={() => router.push(`/scribe/${n.scribeId}`)}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 600, color: "#1a2b3c" }}
                      >
                        {n.scribeName}
                      </button>
                      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", marginTop: "0.3rem" }}>
                        <span
                          style={{
                            background: trustStyle.bg,
                            color: trustStyle.color,
                            padding: "0.15rem 0.7rem",
                            borderRadius: "30px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                          }}
                        >
                          {n.trustLabel}
                        </span>
                        <button
                          onClick={() => setReviewsOpenFor((cur) => (cur === n.noteId ? null : n.noteId))}
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "0.8rem", color: "#5e7188", textDecoration: "underline" }}
                        >
                          <i className="fas fa-star" style={{ color: "#e0a63e" }}></i>{" "}
                          {n.noteAvgRating != null ? `${n.noteAvgRating.toFixed(1)} (${n.noteRatingCount})` : "No ratings yet"}
                        </button>
                      </div>
                    </div>

                    {n.owned ? (
                      <button className="btn btn-primary" onClick={() => router.push(`/notes/${n.noteId}/read`)}>
                        <i className="fas fa-book-open"></i> Read
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary"
                        onClick={() => handlePurchase(n.noteId)}
                        disabled={purchasingNoteId === n.noteId}
                      >
                        <i className="fas fa-lock"></i>{" "}
                        {purchasingNoteId === n.noteId ? "Redirecting..." : `Buy for ₦${price.toLocaleString()}`}
                      </button>
                    )}
                    </div>

                    {reviewsOpenFor === n.noteId && <NoteReviews noteId={n.noteId} />}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NoteReviews({ noteId }: { noteId: string }) {
  const [reviews, setReviews] = useState<{ rating: number; comment: string | null; createdAt: string }[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/api/notes/${noteId}/reviews`)
      .then((data) => setReviews(data.reviews))
      .catch((err) => setError(friendlyErrorMessage(err)));
  }, [noteId]);

  return (
    <div style={{ borderTop: "1px solid #e1e8f0", paddingTop: "0.7rem" }}>
      {error && <p style={{ color: "#b13e3e", fontSize: "0.85rem" }}>{error}</p>}
      {!error && reviews === null && <p style={{ color: "#5e7188", fontSize: "0.85rem" }}>Loading reviews...</p>}
      {!error && reviews && reviews.length === 0 && (
        <p style={{ color: "#5e7188", fontSize: "0.85rem" }}>No reviews yet.</p>
      )}
      {!error && reviews && reviews.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {reviews.map((r, i) => (
            <div key={i} style={{ fontSize: "0.85rem" }}>
              <span style={{ color: "#e0a63e" }}>{"★".repeat(r.rating)}</span>
              <span style={{ color: "#d0dae8" }}>{"★".repeat(5 - r.rating)}</span>
              {r.comment && <span style={{ color: "#3b4c62", marginLeft: "0.5rem" }}>{r.comment}</span>}
              <span style={{ color: "#a3b1c2", marginLeft: "0.5rem", fontSize: "0.78rem" }}>
                {new Date(r.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BlockDetailPage() {
  return (
    <Suspense fallback={null}>
      <BlockDetailInner />
    </Suspense>
  );
}

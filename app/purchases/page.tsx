"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { friendlyErrorMessage } from "@/lib/api-client";

interface PurchaseView {
  purchaseId: string;
  noteId: string;
  blockTitle: string;
  courseCode: string;
  courseName: string;
  scribeId: string;
  scribeName: string;
  review: { rating: number; comment: string | null } | null;
}

export default function PurchasesPage() {
  const router = useRouter();
  const [purchases, setPurchases] = useState<PurchaseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { rating: number; comment: string }>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    const user = getStoredUser();

    if (!user) {
      router.push("/login");
      return;
    }

    fetch("/api/student/purchases")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load purchases");
        setPurchases(data.purchases);
      })
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [router]);

  function setDraftRating(purchaseId: string, rating: number) {
    setDrafts((prev) => ({ ...prev, [purchaseId]: { rating, comment: prev[purchaseId]?.comment || "" } }));
  }
  function setDraftComment(purchaseId: string, comment: string) {
    setDrafts((prev) => ({ ...prev, [purchaseId]: { rating: prev[purchaseId]?.rating || 0, comment } }));
  }

  async function submitReview(purchaseId: string) {
    const draft = drafts[purchaseId];
    if (!draft || !draft.rating) return;

    setSubmitting(purchaseId);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseId, rating: draft.rating, comment: draft.comment || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not submit review");

      setPurchases((prev) =>
        prev.map((p) =>
          p.purchaseId === purchaseId ? { ...p, review: { rating: draft.rating, comment: draft.comment || null } } : p
        )
      );
    } catch (err) {
      alert(friendlyErrorMessage(err));
    } finally {
      setSubmitting(null);
    }
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
              <div className="logo-sub">My purchases</div>
            </div>
          </div>
          <ProfileMenu />
        </div>

        {loading && <p style={{ marginTop: "1rem", color: "#5e7188" }}>Loading...</p>}
        {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}
        {!loading && !error && purchases.length === 0 && (
          <p style={{ marginTop: "1rem", color: "#5e7188" }}>You haven't purchased any blocks yet.</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          {purchases.map((p) => {
            const draft = drafts[p.purchaseId] || { rating: 0, comment: "" };
            return (
              <div key={p.purchaseId} className="block-card" style={{ maxWidth: 480 }}>
                <div className="badge">{p.courseCode}</div>
                <h3>{p.blockTitle}</h3>
                <div className="meta">
                  {p.courseName} · by{" "}
                  <button
                    onClick={() => router.push(`/scribe/${p.scribeId}`)}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#2a7de1" }}
                  >
                    {p.scribeName}
                  </button>
                </div>

                <button
                  onClick={() => router.push(`/notes/${p.noteId}/read`)}
                  className="btn btn-primary"
                  style={{ marginTop: "0.6rem", width: "fit-content" }}
                >
                  <i className="fas fa-file-pdf"></i> Read note
                </button>

                {p.review ? (
                  <div style={{ marginTop: "0.6rem" }}>
                    <div style={{ color: "#e0a63e" }}>
                      {"★".repeat(p.review.rating)}
                      {"☆".repeat(5 - p.review.rating)}
                    </div>
                    {p.review.comment && (
                      <p style={{ fontSize: "0.85rem", color: "#3b4c62", marginTop: "0.3rem" }}>{p.review.comment}</p>
                    )}
                  </div>
                ) : (
                  <div style={{ marginTop: "0.8rem" }}>
                    <div style={{ display: "flex", gap: "0.3rem", marginBottom: "0.5rem" }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setDraftRating(p.purchaseId, star)}
                          style={{
                            background: "none",
                            border: "none",
                            fontSize: "1.4rem",
                            cursor: "pointer",
                            color: star <= draft.rating ? "#e0a63e" : "#d0dae8",
                          }}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={draft.comment}
                      onChange={(e) => setDraftComment(p.purchaseId, e.target.value)}
                      placeholder="Optional comment..."
                      rows={2}
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        borderRadius: "0.6rem",
                        border: "1px solid #d0dae8",
                        fontFamily: "inherit",
                      }}
                    />
                    <button
                      className="btn btn-primary"
                      style={{ marginTop: "0.5rem" }}
                      disabled={!draft.rating || submitting === p.purchaseId}
                      onClick={() => submitReview(p.purchaseId)}
                    >
                      {submitting === p.purchaseId ? "Submitting..." : "Submit review"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { SkeletonList } from "@/app/components/Skeleton";
import { friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { REFUND_WINDOW_MINUTES } from "@/lib/pricing";

interface PurchaseView {
  purchaseId: string;
  noteId: string;
  blockTitle: string;
  courseCode: string;
  courseName: string;
  scribeId: string;
  scribeName: string;
  purchasedAt: string;
  review: { rating: number; comment: string | null } | null;
  refunded: boolean;
  redeemedWithCoupon: boolean;
  refundRequestStatus: "PENDING" | "DISMISSED" | "ACTIONED" | null;
}

export default function PurchasesPage() {
  const router = useRouter();
  const [purchases, setPurchases] = useState<PurchaseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { rating: number; comment: string }>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

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
      toast.error(friendlyErrorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function submitRefundRequest(purchaseId: string) {
    if (refundReason.trim().length < 10) {
      toast.error("Tell the admin a bit more — at least 10 characters.");
      return;
    }

    setRefundSubmitting(true);
    try {
      const res = await fetch(`/api/purchases/${purchaseId}/refund-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: refundReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not submit refund request");

      toast.success("Refund request sent — an admin will take a look.");
      setPurchases((prev) =>
        prev.map((p) => (p.purchaseId === purchaseId ? { ...p, refundRequestStatus: "PENDING" } : p))
      );
      setRefundingId(null);
      setRefundReason("");
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setRefundSubmitting(false);
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
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="btn" onClick={() => router.push("/following")}>
              <i className="fas fa-user-check"></i> Following
            </button>
            <ProfileMenu />
          </div>
        </div>

        {loading && <SkeletonList rows={3} />}
        {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}
        {!loading && !error && purchases.length === 0 && (
          <p style={{ marginTop: "1rem", color: "var(--text-secondary)" }}>You haven't purchased any course notes yet.</p>
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
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text-info)" }}
                  >
                    {p.scribeName}
                  </button>
                </div>

                {p.refunded ? (
                  <div
                    style={{ marginTop: "0.6rem", padding: "0.5rem 0.8rem", borderRadius: "0.6rem", background: "var(--bg-danger)", color: "var(--text-danger)", fontSize: "0.85rem", width: "fit-content" }}
                  >
                    <i className="fas fa-ban"></i> Refunded — access removed
                  </div>
                ) : (
                  <button
                    onClick={() => router.push(`/notes/${p.noteId}/read`)}
                    className="btn btn-primary"
                    style={{ marginTop: "0.6rem", width: "fit-content" }}
                  >
                    <i className="fas fa-file-pdf"></i> Read note
                  </button>
                )}
                {p.redeemedWithCoupon && (
                  <div style={{ fontSize: "0.75rem", color: "var(--text-pro)", marginTop: "0.3rem" }}>
                    <i className="fas fa-ticket"></i> Unlocked with a coupon
                  </div>
                )}

                {p.review ? (
                  <div style={{ marginTop: "0.6rem" }}>
                    <div style={{ color: "var(--star)" }}>
                      {"★".repeat(p.review.rating)}
                      {"☆".repeat(5 - p.review.rating)}
                    </div>
                    {p.review.comment && (
                      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.3rem" }}>{p.review.comment}</p>
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
                            color: star <= draft.rating ? "var(--star)" : "var(--border-blue)",
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
                        border: "1px solid var(--border-blue)",
                        fontFamily: "inherit",
                      }}
                    />
                    <button
                      className="btn press-on-tap"
                      style={{ marginTop: "0.5rem" }}
                      disabled={!draft.rating || submitting === p.purchaseId}
                      onClick={() => submitReview(p.purchaseId)}
                    >
                      {submitting === p.purchaseId ? "Submitting..." : "Submit review"}
                    </button>
                  </div>
                )}

                {!p.refunded && (() => {
                  const minutesSince = (now - new Date(p.purchasedAt).getTime()) / 60000;
                  const minutesLeft = Math.max(0, Math.ceil(REFUND_WINDOW_MINUTES - minutesSince));
                  const windowOpen = minutesSince <= REFUND_WINDOW_MINUTES;

                  return (
                    <div style={{ marginTop: "0.7rem", borderTop: "1px solid var(--border-blue)", paddingTop: "0.6rem" }}>
                      {p.refundRequestStatus === "PENDING" ? (
                        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                          <i className="fas fa-clock"></i> Refund request pending review
                        </p>
                      ) : !windowOpen ? (
                        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                          <i className="fas fa-lock"></i> Refund window closed ({REFUND_WINDOW_MINUTES} min after purchase)
                        </p>
                      ) : refundingId === p.purchaseId ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                            Why do you want a refund for this?
                          </label>
                          <textarea
                            value={refundReason}
                            onChange={(e) => setRefundReason(e.target.value)}
                            rows={2}
                            placeholder="Explain what went wrong..."
                            style={{ padding: "0.5rem", borderRadius: "0.6rem", border: "1px solid var(--border-blue)", fontFamily: "inherit", fontSize: "0.85rem", background: "var(--surface)", color: "var(--text-primary)" }}
                          />
                          <div style={{ display: "flex", gap: "0.6rem" }}>
                            <button
                              className="btn btn-primary press-on-tap"
                              disabled={refundSubmitting}
                              onClick={() => submitRefundRequest(p.purchaseId)}
                            >
                              {refundSubmitting ? "Sending..." : "Send request"}
                            </button>
                            <button className="btn" type="button" onClick={() => { setRefundingId(null); setRefundReason(""); }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="btn press-on-tap"
                          style={{ fontSize: "0.8rem" }}
                          onClick={() => setRefundingId(p.purchaseId)}
                        >
                          <i className="fas fa-hand-holding-dollar"></i> Request refund
                          <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>&nbsp;({minutesLeft} min left)</span>
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

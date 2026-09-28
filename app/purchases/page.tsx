"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import { SkeletonList } from "@/app/components/Skeleton";
import { friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { REFUND_WINDOW_MINUTES } from "@/lib/pricing";
import { Icon } from "@/app/components/icons";

interface PurchaseView {
  purchaseId: string;
  noteId: string;
  blockId: string;
  blockTitle: string;
  courseCode: string;
  courseName: string;
  scribeId: string;
  scribeName: string;
  purchasedAt: string;
  review: { rating: number; comment: string | null } | null;
  refunded: boolean;
  amountPaid: number;
  creditApplied: number;
  redeemedWithCoupon: boolean;
  refundRequestStatus: "PENDING" | "DISMISSED" | "ACTIONED" | null;
  unopened: boolean;
}

function spineTone(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const tones = ["#4a2420", "#2c3a2a", "#243248", "#5c3d24", "#3a2036"];
  return tones[Math.abs(hash) % tones.length];
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
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "title" | "scribe">("recent");

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
        setPurchases(data.purchases || []);
      })
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [router]);

  function setDraftRating(purchaseId: string, rating: number) {
    setDrafts((prev) => ({
      ...prev,
      [purchaseId]: { rating, comment: prev[purchaseId]?.comment || "" },
    }));
  }

  function setDraftComment(purchaseId: string, comment: string) {
    setDrafts((prev) => ({
      ...prev,
      [purchaseId]: { rating: prev[purchaseId]?.rating || 0, comment },
    }));
  }

  async function submitReview(purchaseId: string) {
    const draft = drafts[purchaseId];
    if (!draft?.rating) return;

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
        prev.map((p) => (p.purchaseId === purchaseId ? { ...p, review: { rating: draft.rating, comment: draft.comment || null } } : p))
      );
      toast.success("Review submitted");
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
      setPurchases((prev) => prev.map((p) => (p.purchaseId === purchaseId ? { ...p, refundRequestStatus: "PENDING" } : p)));
      setRefundingId(null);
      setRefundReason("");
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setRefundSubmitting(false);
    }
  }

  const visiblePurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? purchases.filter(
          (p) =>
            p.blockTitle.toLowerCase().includes(q) ||
            p.courseName.toLowerCase().includes(q) ||
            p.courseCode.toLowerCase().includes(q) ||
            p.scribeName.toLowerCase().includes(q)
        )
      : purchases;

    if (sortBy === "oldest") return [...filtered].reverse();
    if (sortBy === "title") return [...filtered].sort((a, b) => a.blockTitle.localeCompare(b.blockTitle));
    if (sortBy === "scribe") return [...filtered].sort((a, b) => a.scribeName.localeCompare(b.scribeName));
    return filtered;
  }, [purchases, search, sortBy]);

  const totalSpent = purchases.reduce((sum, p) => sum + p.amountPaid, 0);

  return (
    <div className="page-wrap student-page">
      <div className="app-container student-app-container">
        <section className="page-view is-active">
          <div className="page-header">
            <div className="page-header-left">
              <span className="eyebrow">Your Collection</span>
              <h1>
                My <span className="serif">library</span>
              </h1>
              <p>Every note you've bought, watermarked to you and available offline in the reader.</p>
            </div>
            <div className="page-header-right">
              <div className="stat-strip">
                <div className="stat">
                  <div className="stat-num">{purchases.length}</div>
                  <div className="stat-label">Notes owned</div>
                </div>
                <div className="stat">
                  <div className="stat-num">₦{totalSpent.toLocaleString()}</div>
                  <div className="stat-label">Total spent</div>
                </div>
              </div>
              <div className="header-actions">
                <button className="btn btn-ghost" onClick={() => router.push("/following")}>
                  {Icon.user()} Following
                </button>
              </div>
            </div>
          </div>

          <div className="library-toolbar">
            <div className="library-search">
              {Icon.search()}
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your library by code, title, or scribe…" />
            </div>
            <select className="library-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} aria-label="Sort library">
              <option value="recent">Most recent</option>
              <option value="oldest">Oldest first</option>
              <option value="title">Title A–Z</option>
              <option value="scribe">Scribe A–Z</option>
            </select>
          </div>

          {loading && <SkeletonList rows={3} />}
          {error && <div className="auth-error">{error}</div>}
          {!loading && !error && purchases.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">{Icon.book()}</div>
              <h3 className="empty-title">Nothing here yet</h3>
              <p className="empty-desc">Notes you buy will appear here forever — re-open them any time.</p>
              <button className="btn btn-primary" onClick={() => router.push("/dashboard")}>
                Browse notes {Icon.arrow()}
              </button>
            </div>
          )}
          {!loading && !error && purchases.length > 0 && visiblePurchases.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">{Icon.search()}</div>
              <h3 className="empty-title">No purchases match</h3>
              <p className="empty-desc">Try a different course code, note title, or scribe name.</p>
            </div>
          )}

          {!loading && !error && visiblePurchases.length > 0 && (
            <div className="library-grid">
              {visiblePurchases.map((p) => {
                const draft = drafts[p.purchaseId] || { rating: 0, comment: "" };
                const minutesSince = (now - new Date(p.purchasedAt).getTime()) / 60000;
                const minutesLeft = Math.max(0, Math.ceil(REFUND_WINDOW_MINUTES - minutesSince));
                const windowOpen = minutesSince <= REFUND_WINDOW_MINUTES;

                return (
                  <article className="purchase-card" key={p.purchaseId}>
                    <div className="spine" style={{ "--spine-color": spineTone(p.blockTitle) } as React.CSSProperties}>
                      <span className="spine-code">{p.courseCode}</span>
                    </div>

                    <div className="purchase-body">
                      <div className="purchase-code">{p.courseCode}</div>
                      <button className="purchase-title" onClick={() => router.push(`/blocks/${p.blockId}?note=${p.noteId}`)}>
                        {p.blockTitle}
                      </button>
                      <div className="purchase-scribe">
                        {Icon.user()} by{" "}
                        <button className="scribe-name-button" onClick={() => router.push(`/scribe/${p.scribeId}`)}>
                          <strong>{p.scribeName}</strong>
                        </button>
                      </div>

                      <div className="purchase-foot">
                        <span className="purchase-date">Purchased {new Date(p.purchasedAt).toLocaleDateString()}</span>
                        {!p.refunded ? (
                          <button className="read-btn" onClick={() => router.push(`/notes/${p.noteId}/read`)}>
                            {Icon.eye()} Read note
                          </button>
                        ) : (
                          <span className="status rejected">Refunded</span>
                        )}
                      </div>

                      {p.refunded ? (
                        <div className="purchase-extra">
                          <div className="callout" style={{ background: "var(--bg-danger)", borderColor: "var(--text-danger)", color: "var(--text-danger)" }}>
                            {Icon.warn()} <span>Refunded — access removed.</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          {(p.creditApplied > 0 || p.unopened) && (
                            <div className="purchase-extra">
                              {p.creditApplied > 0 && (
                                <div className="credit-note">
                                  {p.amountPaid === 0
                                    ? `₦${p.creditApplied.toLocaleString()} credit used to unlock this note`
                                    : `₦${p.creditApplied.toLocaleString()} credit applied — you paid ₦${p.amountPaid.toLocaleString()}`}
                                </div>
                              )}
                              {p.unopened && <span className="status open" style={{ marginTop: 8 }}>Not started</span>}
                            </div>
                          )}

                          <div className="purchase-extra">
                            {p.review ? (
                              <div className="existing-review">
                                <div className="review-stars">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <span key={star} className={`review-star${star <= p.review!.rating ? " is-selected" : ""}`}>★</span>
                                  ))}
                                </div>
                                {p.review.comment && <div className="review-comment-display">{p.review.comment}</div>}
                              </div>
                            ) : (
                              <>
                                <div className="review-stars" aria-label="Choose a rating">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                      key={star}
                                      type="button"
                                      className={`review-star${star <= draft.rating ? " is-selected" : ""}`}
                                      onClick={() => setDraftRating(p.purchaseId, star)}
                                      aria-label={`${star} star${star === 1 ? "" : "s"}`}
                                    >
                                      ★
                                    </button>
                                  ))}
                                </div>
                                <textarea
                                  className="review-comment"
                                  value={draft.comment}
                                  onChange={(e) => setDraftComment(p.purchaseId, e.target.value)}
                                  placeholder="Optional comment…"
                                  rows={2}
                                />
                                <div className="review-actions">
                                  <button className="btn btn-sm btn-primary" disabled={!draft.rating || submitting === p.purchaseId} onClick={() => submitReview(p.purchaseId)}>
                                    {submitting === p.purchaseId ? "Submitting…" : "Submit review"}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>

                          <div className="refund-area">
                            {p.refundRequestStatus === "PENDING" ? (
                              <p className="refund-muted">{Icon.clock()} Refund request pending review.</p>
                            ) : !windowOpen ? (
                              <p className="refund-muted">{Icon.lock()} Refund window closed ({REFUND_WINDOW_MINUTES} min after purchase).</p>
                            ) : refundingId === p.purchaseId ? (
                              <>
                                <label className="form-label">Why do you want a refund?</label>
                                <textarea
                                  className="refund-reason"
                                  value={refundReason}
                                  onChange={(e) => setRefundReason(e.target.value)}
                                  placeholder="Explain what went wrong…"
                                  rows={3}
                                />
                                <div className="refund-actions">
                                  <button className="btn btn-sm btn-primary" disabled={refundSubmitting} onClick={() => submitRefundRequest(p.purchaseId)}>
                                    {refundSubmitting ? "Sending…" : "Send request"}
                                  </button>
                                  <button className="btn btn-sm btn-ghost" type="button" onClick={() => { setRefundingId(null); setRefundReason(""); }}>
                                    Cancel
                                  </button>
                                </div>
                              </>
                            ) : (
                              <button className="btn btn-sm btn-ghost" onClick={() => setRefundingId(p.purchaseId)}>
                                Request refund <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>({minutesLeft} min left)</span>
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

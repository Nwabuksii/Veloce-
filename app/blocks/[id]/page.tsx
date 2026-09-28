"use client";

import { useEffect, useState, FormEvent, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import PageHeader from "@/app/components/PageHeader";
import Avatar from "@/app/components/Avatar";
import { SkeletonList } from "@/app/components/Skeleton";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import CouponConfirmDialog from "@/app/components/CouponConfirmDialog";
import { getEffectivePriceForNote } from "@/lib/pricing";
import "./block-details.css";

interface NoteVersion {
  noteId: string;
  scribeId: string;
  scribeName: string;
  scribeAvatarUrl: string | null;
  scribeLevel: string | null;
  trustLevel: string;
  trustLabel: string;
  noteAvgRating: number | null;
  noteRatingCount: number;
  uploadedAt: string;
  pageCount: number | null;
  attestedOriginal: boolean;
  purchaseCount: number;
  owned: boolean;
  purchaseId: string | null;
  myReview: { rating: number; comment: string | null } | null;
  price: number;
  isRequestFulfillment: boolean;
}

const TRUST_STYLES: Record<string, { bg: string; color: string }> = {
  NEW: { bg: "var(--bg-info)", color: "var(--text-secondary)" },
  RISING: { bg: "var(--bg-warning)", color: "var(--text-warning)" },
  TRUSTED: { bg: "var(--bg-success)", color: "var(--text-success)" },
  ELITE: { bg: "var(--bg-pro)", color: "var(--text-pro)" },
};

function BlockDetailInner() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const blockId = params.id as string;
  const highlightNoteId = searchParams.get("note");

  const [blockTitle, setBlockTitle] = useState("");
  const [price, setPrice] = useState(0);
  const [courseName, setCourseName] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [universityName, setUniversityName] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [purchaseCount, setPurchaseCount] = useState(0);
  const [liveNoteCount, setLiveNoteCount] = useState(0);
  const [blockAvgRating, setBlockAvgRating] = useState<number | null>(null);
  const [blockRatingCount, setBlockRatingCount] = useState(0);
  const [detailsOpenFor, setDetailsOpenFor] = useState<string | null>(null);
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
  const [reportingNoteId, setReportingNoteId] = useState<string | null>(null);
  const [noteReportReason, setNoteReportReason] = useState("");
  const [noteReportSubmitting, setNoteReportSubmitting] = useState(false);
  const [noteReportStatus, setNoteReportStatus] = useState<{ noteId: string; message: string } | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [pendingCouponNoteId, setPendingCouponNoteId] = useState<string | null>(null);
  const [couponConfirming, setCouponConfirming] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      const here = `${window.location.pathname}${window.location.search}`;
      router.push(`/login?returnTo=${encodeURIComponent(here)}`);
      return;
    }
    load();
    fetch("/api/account")
      .then((res) => res.json())
      .then((data) => setCreditBalance(data.user?.creditBalance ?? 0))
      .catch(() => setCreditBalance(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, blockId]);

  function load() {
    setLoading(true);
    apiFetch(`/api/blocks/${blockId}/notes`)
      .then((data) => {
        setBlockTitle(data.blockTitle);
        setPrice(data.price);
        setCourseName(data.courseName);
        setCourseCode(data.courseCode);
        setDepartmentName(data.departmentName);
        setUniversityName(data.universityName);
        setTopics(data.topics ?? []);
        setPurchaseCount(data.purchaseCount ?? 0);
        setLiveNoteCount(data.liveNoteCount ?? 0);
        setBlockAvgRating(data.avgRating ?? null);
        setBlockRatingCount(data.ratingCount ?? 0);
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

      if (data.freeViaCoupon) {
        toast.success("Credit used — no charge!");
        router.push(`/notes/${data.noteId}/read`);
        return;
      }

      window.location.href = data.authorizationUrl;
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
      setPurchasingNoteId(null);
    }
  }

  // Coupon purchases skip Paystack entirely, so there's no external
  // checkout page to give someone a natural "wait, cancel that" moment —
  // this dialog is that moment instead.
  function handleBuyClick(noteId: string) {
    if (creditBalance != null && creditBalance > 0) {
      setPendingCouponNoteId(noteId);
      return;
    }
    handlePurchase(noteId);
  }

  async function confirmCouponBuy() {
    if (!pendingCouponNoteId) return;
    setCouponConfirming(true);
    await handlePurchase(pendingCouponNoteId);
    setCouponConfirming(false);
    setPendingCouponNoteId(null);
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

  async function handleNoteReportSubmit(e: FormEvent, noteId: string) {
    e.preventDefault();

    if (noteReportReason.trim().length < 10) {
      toast.error("Tell us a bit more — at least 10 characters.");
      return;
    }

    setNoteReportSubmitting(true);
    try {
      await apiFetch(`/api/notes/${noteId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: noteReportReason.trim() }),
      });
      setNoteReportStatus({ noteId, message: "Report submitted — an admin will take a look." });
      setNoteReportReason("");
      setReportingNoteId(null);
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setNoteReportSubmitting(false);
    }
  }

  return (
    <div className="page-wrap block-detail-page">
      <div className="app-container block-detail-container">
        <PageHeader title="Block details" subtitle="Compare versions, read reviews and unlock notes.">
          <button className="btn block-back-btn" onClick={() => router.push("/dashboard")}>
            <i className="fas fa-arrow-left"></i> Catalog
          </button>
        </PageHeader>

        {loading && (
          <div className="block-loading">
            <SkeletonList rows={4} />
          </div>
        )}

        {error && !loading && (
          <section className="block-error-card">
            <div className="block-error-icon">!</div>
            <h2>We couldn't load this block</h2>
            <p>{error}</p>
            <button className="btn btn-primary" onClick={() => router.push("/dashboard")}>Go back</button>
          </section>
        )}

        {!loading && !error && (
          <main className="block-detail-content">
            <section className="block-hero">
              <div className="block-hero-copy">
                <div className="block-kicker">
                  {universityName ? `${universityName} · ` : ""}{courseCode || "COURSE"} · {courseName || "Course"}
                </div>
                <h1>{blockTitle}</h1>
                <div className="block-hero-meta">
                  {departmentName && <span>{departmentName}</span>}
                  {topics.slice(0, 4).map((topic) => (
                    <span key={topic} className="block-pill">{topic}</span>
                  ))}
                </div>
              </div>

              <div className="block-hero-actions">
                <button className="btn block-hero-btn" onClick={handleCopyLink}>
                  <i className="fas fa-link"></i> {copyLabel}
                </button>
                <button className="btn block-hero-btn" onClick={() => setReporting((v) => !v)}>
                  <i className="fas fa-flag"></i> Report
                </button>
              </div>
            </section>

            {reporting && (
              <form onSubmit={handleReportSubmit} className="block-report-panel">
                <label>
                  Why are you reporting this block?
                </label>
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  rows={3}
                  placeholder="Explain what's wrong with this block..."
                />
                <div className="block-inline-actions">
                  <button className="btn btn-primary" type="submit" disabled={reportSubmitting}>
                    {reportSubmitting ? "Submitting..." : "Submit report"}
                  </button>
                  <button className="btn" type="button" onClick={() => setReporting(false)}>Cancel</button>
                </div>
              </form>
            )}

            {reportStatus && !reporting && (
              <p className="block-success-message">{reportStatus}</p>
            )}

            <section className="block-stats">
              <div className="block-stat">
                <span>Purchases</span>
                <strong>{purchaseCount.toLocaleString()}</strong>
              </div>
              <div className="block-stat">
                <span>Versions</span>
                <strong>{liveNoteCount}</strong>
              </div>
              <div className="block-stat">
                <span>Rating</span>
                <strong>{blockAvgRating != null ? blockAvgRating.toFixed(1) : "New"}</strong>
                <small>{blockRatingCount > 0 ? `${blockRatingCount} review${blockRatingCount === 1 ? "" : "s"}` : "No reviews yet"}</small>
              </div>
              <div className="block-stat">
                <span>Topics</span>
                <strong>{topics.length}</strong>
              </div>
            </section>

            <div className="block-detail-grid">
              <section className="block-main-column">
                <div className="block-section-heading">
                  <div>
                    <span className="block-eyebrow">The ledger</span>
                    <h2>Available versions</h2>
                  </div>
                  <span className="block-count">{notes.length} version{notes.length === 1 ? "" : "s"}</span>
                </div>

                {topics.length > 0 && (
                  <div className="block-topic-list">
                    {topics.map((topic) => <span key={topic} className="block-topic">{topic}</span>)}
                  </div>
                )}

                {notes.length === 0 && (
                  <div className="block-empty">
                    <div className="block-empty-mark">—</div>
                    <h3>No live notes for this topic yet.</h3>
                    <p>Check back later for notes uploaded by scribes.</p>
                  </div>
                )}

                <div className="block-version-list">
                  {notes.map((n, index) => {
                    const trustStyle = TRUST_STYLES[n.trustLevel] || TRUST_STYLES.NEW;
                    return (
                      <article
                        key={n.noteId}
                        className={`block-version-card ${n.noteId === highlightNoteId ? "is-highlighted" : ""}`}
                      >
                        <div className="block-version-topline">
                          <span className="block-version-number">VERSION {String(index + 1).padStart(2, "0")}</span>
                          {n.noteId === highlightNoteId && <span className="block-shared-badge">Shared with you</span>}
                          {n.isRequestFulfillment && <span className="block-fixed-badge">Fixed request price</span>}
                        </div>

                        <div className="block-version-body">
                          <div className="block-scribe-row">
                            <Avatar name={n.scribeName} imageUrl={n.scribeAvatarUrl} size="sm" />
                            <div className="block-scribe-copy">
                              <button className="block-scribe-name" onClick={() => router.push(`/scribe/${n.scribeId}`)}>
                                {n.scribeName}
                              </button>
                              <div className="block-scribe-meta">
                                <span className="block-trust" style={{ background: trustStyle.bg, color: trustStyle.color }}>
                                  {n.trustLabel}
                                </span>
                                {n.scribeLevel && <span>Level {n.scribeLevel}</span>}
                                <span>{new Date(n.uploadedAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>

                          <div className="block-version-rating">
                            <span className="block-stars">{"★".repeat(Math.max(0, Math.round(n.noteAvgRating ?? 0)))}</span>
                            <span>{n.noteAvgRating != null ? `${n.noteAvgRating.toFixed(1)} (${n.noteRatingCount})` : "No ratings yet"}</span>
                          </div>
                        </div>

                        <div className="block-version-details">
                          <div className="block-detail-item">
                            <span>Pages</span>
                            <strong>{n.pageCount != null ? n.pageCount : "—"}</strong>
                          </div>
                          <div className="block-detail-item">
                            <span>Bought</span>
                            <strong>{n.purchaseCount.toLocaleString()}</strong>
                          </div>
                          <div className="block-detail-item">
                            <span>Original</span>
                            <strong>{n.attestedOriginal ? "Attested" : "Not attested"}</strong>
                          </div>
                          <button
                            className="block-details-toggle"
                            onClick={() => setDetailsOpenFor((cur) => cur === n.noteId ? null : n.noteId)}
                          >
                            {detailsOpenFor === n.noteId ? "Hide details" : "Details"}
                            <i className={`fas fa-chevron-${detailsOpenFor === n.noteId ? "up" : "down"}`}></i>
                          </button>
                        </div>

                        {detailsOpenFor === n.noteId && (
                          <div className="block-expanded-details">
                            {n.scribeLevel && <span>Level at upload: {n.scribeLevel}</span>}
                            <span>Uploaded {new Date(n.uploadedAt).toLocaleDateString()}</span>
                            <span>{n.pageCount != null ? `${n.pageCount} page${n.pageCount === 1 ? "" : "s"}` : "Page count not yet available"}</span>
                            <span>
                              {n.attestedOriginal ? (
                                <><i className="fas fa-check"></i> Scribe attested this is their own original work</>
                              ) : "No originality attestation on file"}
                            </span>
                          </div>
                        )}

                        <div className="block-version-footer">
                          <div className="block-version-footer-links">
                            <button onClick={() => setReviewsOpenFor((cur) => cur === n.noteId ? null : n.noteId)}>
                              <i className="fas fa-star"></i> Reviews
                            </button>
                            <button onClick={() => setReportingNoteId((cur) => cur === n.noteId ? null : n.noteId)}>
                              <i className="fas fa-flag"></i> Report
                            </button>
                          </div>

                          <div className="block-price-action">
                            <div className="block-price">
                              <span>{n.owned ? "Owned" : "Price"}</span>
                              <strong>{n.owned ? "—" : `₦${n.price.toLocaleString()}`}</strong>
                            </div>
                            {n.owned ? (
                              <button className="btn btn-primary" onClick={() => router.push(`/notes/${n.noteId}/read`)}>
                                <i className="fas fa-book-open"></i> Read
                              </button>
                            ) : (
                              <button
                                className="btn btn-primary"
                                onClick={() => handleBuyClick(n.noteId)}
                                disabled={purchasingNoteId === n.noteId}
                              >
                                <i className={creditBalance != null && creditBalance > 0 ? "fas fa-ticket" : "fas fa-lock"}></i>{" "}
                                {purchasingNoteId === n.noteId
                                  ? "Redirecting..."
                                  : creditBalance != null && creditBalance > 0
                                    ? creditBalance >= n.price
                                      ? "Use credit (free)"
                                      : `Use ₦${creditBalance.toLocaleString()} credit — pay ₦${(n.price - creditBalance).toLocaleString()}`
                                    : `Buy for ₦${n.price.toLocaleString()}`}
                              </button>
                            )}
                          </div>
                        </div>

                        {reviewsOpenFor === n.noteId && (
                          <NoteReviews
                            noteId={n.noteId}
                            owned={n.owned}
                            purchaseId={n.purchaseId}
                            myReview={n.myReview}
                            onReviewed={(rating, comment) =>
                              setNotes((prev) => prev.map((note) => (
                                note.noteId === n.noteId ? { ...note, myReview: { rating, comment } } : note
                              )))
                            }
                          />
                        )}

                        {reportingNoteId === n.noteId && (
                          <form
                            onSubmit={(e) => handleNoteReportSubmit(e, n.noteId)}
                            className="block-note-report"
                          >
                            <label>Why are you reporting {n.scribeName}&apos;s version specifically?</label>
                            <div className="block-report-presets">
                              {[
                                "Not genuine — looks copied from slides/a textbook, not real lecture notes",
                                "Incomplete or missing pages",
                                "Doesn't match what this block is supposed to cover",
                              ].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  className="btn"
                                  onClick={() => setNoteReportReason(preset)}
                                >
                                  {preset}
                                </button>
                              ))}
                            </div>
                            <textarea
                              value={noteReportReason}
                              onChange={(e) => setNoteReportReason(e.target.value)}
                              rows={2}
                              placeholder="Explain what's wrong with this specific version..."
                            />
                            <div className="block-inline-actions">
                              <button className="btn btn-primary" type="submit" disabled={noteReportSubmitting}>
                                {noteReportSubmitting ? "Submitting..." : "Submit report"}
                              </button>
                              <button className="btn" type="button" onClick={() => setReportingNoteId(null)}>Cancel</button>
                            </div>
                          </form>
                        )}

                        {noteReportStatus?.noteId === n.noteId && (
                          <p className="block-success-message">{noteReportStatus.message}</p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>

              <aside className="block-side-column">
                <div className="block-purchase-card">
                  <span className="block-eyebrow">Access this block</span>
                  <h2>Choose a version</h2>
                  <p>Compare the available notes below and unlock the version that fits your needs.</p>
                  <div className="block-starting-price">
                    <span>Starting from</span>
                    <strong>
                      {notes.length > 0
                        ? `₦${Math.min(...notes.map((n) => n.price)).toLocaleString()}`
                        : `₦${price.toLocaleString()}`}
                    </strong>
                  </div>
                  <div className="block-side-rule"></div>
                  <div className="block-side-stat"><span>Course</span><strong>{courseCode || "—"}</strong></div>
                  <div className="block-side-stat"><span>Department</span><strong>{departmentName || "—"}</strong></div>
                  <div className="block-side-stat"><span>University</span><strong>{universityName || "—"}</strong></div>
                  <div className="block-side-rule"></div>
                  <p className="block-side-note">
                    <i className="fas fa-shield-halved"></i> Payments are handled through Veloce checkout.
                  </p>
                </div>

                <div className="block-about-card">
                  <span className="block-eyebrow">About this block</span>
                  <h3>{blockTitle}</h3>
                  <p>
                    {courseName ? `${courseName} notes from ${departmentName || "the department"}. ` : ""}
                    {topics.length > 0 ? `Covers ${topics.slice(0, 4).join(", ")}${topics.length > 4 ? " and more." : "."}` : "Compare verified student notes and reviews."}
                  </p>
                  <div className="block-about-list">
                    <div><span>Live versions</span><strong>{liveNoteCount}</strong></div>
                    <div><span>Total purchases</span><strong>{purchaseCount.toLocaleString()}</strong></div>
                    <div><span>Block rating</span><strong>{blockAvgRating != null ? `${blockAvgRating.toFixed(1)} / 5` : "New"}</strong></div>
                  </div>
                </div>
              </aside>
            </div>
          </main>
        )}
      </div>

      {pendingCouponNoteId && creditBalance != null && (
        <CouponConfirmDialog
          itemLabel={`${blockTitle} — ${notes.find((n) => n.noteId === pendingCouponNoteId)?.scribeName ?? "this version"}`}
          price={notes.find((n) => n.noteId === pendingCouponNoteId)?.price ?? price}
          creditBalance={creditBalance}
          confirming={couponConfirming}
          onConfirm={confirmCouponBuy}
          onCancel={() => setPendingCouponNoteId(null)}
        />
      )}
    </div>
  );
}

function NoteReviews({
  noteId,
  owned,
  purchaseId,
  myReview,
  onReviewed,
}: {
  noteId: string;
  owned: boolean;
  purchaseId: string | null;
  myReview: { rating: number; comment: string | null } | null;
  onReviewed: (rating: number, comment: string | null) => void;
}) {
  const [reviews, setReviews] = useState<{ rating: number; comment: string | null; createdAt: string }[] | null>(null);
  const [error, setError] = useState("");
  const [draftRating, setDraftRating] = useState(0);
  const [draftComment, setDraftComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch(`/api/notes/${noteId}/reviews`)
      .then((data) => setReviews(data.reviews))
      .catch((err) => setError(friendlyErrorMessage(err)));
  }, [noteId]);

  async function submitReview() {
    if (!purchaseId || !draftRating) return;
    setSubmitting(true);
    try {
      await apiFetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseId, rating: draftRating, comment: draftComment || undefined }),
      });
      onReviewed(draftRating, draftComment || null);
      setReviews((prev) => [{ rating: draftRating, comment: draftComment || null, createdAt: new Date().toISOString() }, ...(prev ?? [])]);
      toast.success("Review submitted");
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="block-note-reviews">
      {/* Second door to leave a review — the first is the Purchases page.
          Only the actual buyer sees this, and only until they've reviewed. */}
      {owned && purchaseId && (
        <div style={{ marginBottom: "0.8rem" }}>
          {myReview ? (
            <div style={{ fontSize: "0.85rem" }}>
              <span style={{ color: "var(--text-secondary)" }}>Your review: </span>
              <span style={{ color: "var(--star)" }}>{"★".repeat(myReview.rating)}</span>
              <span style={{ color: "var(--border-blue)" }}>{"★".repeat(5 - myReview.rating)}</span>
              {myReview.comment && <span style={{ marginLeft: "0.5rem" }}>{myReview.comment}</span>}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Leave a review</div>
              <div style={{ display: "flex", gap: "0.2rem" }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setDraftRating(star)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "1.1rem" }}
                  >
                    <span style={{ color: star <= draftRating ? "var(--star)" : "var(--border-blue)" }}>★</span>
                  </button>
                ))}
              </div>
              <textarea
                value={draftComment}
                onChange={(e) => setDraftComment(e.target.value)}
                rows={2}
                placeholder="Optional comment..."
                style={{
                  padding: "0.5rem",
                  borderRadius: "0.6rem",
                  border: "1px solid var(--border-blue)",
                  fontFamily: "inherit",
                  fontSize: "0.85rem",
                  background: "var(--surface)",
                  color: "var(--text-primary)",
                }}
              />
              <button
                className="btn press-on-tap"
                style={{ width: "fit-content" }}
                disabled={!draftRating || submitting}
                onClick={submitReview}
              >
                {submitting ? "Submitting..." : "Submit review"}
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p style={{ color: "var(--text-danger)", fontSize: "0.85rem" }}>{error}</p>}
      {!error && reviews === null && <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Loading reviews...</p>}
      {!error && reviews && reviews.length === 0 && (
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>No reviews yet.</p>
      )}
      {!error && reviews && reviews.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {reviews.map((r, i) => (
            <div key={i} style={{ fontSize: "0.85rem" }}>
              <span style={{ color: "var(--star)" }}>{"★".repeat(r.rating)}</span>
              <span style={{ color: "var(--border-blue)" }}>{"★".repeat(5 - r.rating)}</span>
              {r.comment && <span style={{ color: "var(--text-secondary)", marginLeft: "0.5rem" }}>{r.comment}</span>}
              <span style={{ color: "var(--text-muted)", marginLeft: "0.5rem", fontSize: "0.78rem" }}>
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

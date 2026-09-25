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

interface NoteVersion {
  noteId: string;
  scribeId: string;
  scribeName: string;
  scribeAvatarUrl: string | null;
  trustLevel: string;
  trustLabel: string;
  noteAvgRating: number | null;
  noteRatingCount: number;
  purchaseCount: number;
  uploadedAt: string;
  pageCount: number | null;
  attestedOriginal: boolean;
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
    <div className="page-wrap">
      <div className="app-container" style={{ maxWidth: 640 }}>
        <PageHeader title="Block details" subtitle="Compare versions, read reviews and unlock notes.">
          <button className="btn" onClick={() => router.push("/dashboard")}>
              <i className="fas fa-arrow-left"></i> Catalog
            </button>
        </PageHeader>

        {loading && <SkeletonList rows={3} />}
        {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}

        {!loading && !error && (
          <div style={{ marginTop: "1.5rem" }}>
            <div
              style={{
                background: "var(--ink)",
                color: "white",
                borderRadius: "12px",
                padding: "1.5rem 1.7rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                flexWrap: "wrap",
                gap: "0.8rem",
              }}
            >
              <div>
                <span className="mono" style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.65)" }}>
                  {courseCode} · {courseName} · {departmentName}
                </span>
                <h2 style={{ fontSize: "1.4rem", marginTop: "0.15rem" }}>{blockTitle}</h2>
                <span className="price-tag mono" style={{ marginTop: "0.4rem", display: "inline-block", color: "white" }}>
                  {notes.length > 0 && new Set(notes.map((n) => n.price)).size > 1
                    ? `From ₦${Math.min(...notes.map((n) => n.price)).toLocaleString()}`
                    : `₦${(notes[0]?.price ?? price).toLocaleString()}`}
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
              <form onSubmit={handleReportSubmit} style={{ marginTop: "1rem", background: "var(--surface)", border: "1px solid var(--border-blue)", borderRadius: "1rem", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  Why are you reporting this block? (wrong/stolen content, low quality, etc.)
                </label>
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  rows={3}
                  placeholder="Explain what's wrong with this block..."
                  style={{ padding: "0.6rem", borderRadius: "0.6rem", border: "1px solid var(--border-blue)", fontFamily: "inherit", fontSize: "0.85rem" }}
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
              <p style={{ color: "var(--text-success)", marginTop: "0.6rem", fontSize: "0.85rem" }}>{reportStatus}</p>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: "0.75rem",
                marginTop: "1rem",
              }}
            >
              <div style={{ background: "var(--surface)", border: "1px solid var(--border-blue)", borderRadius: "0.8rem", padding: "0.8rem" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Purchases</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "0.25rem" }}>{purchaseCount.toLocaleString()}</div>
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border-blue)", borderRadius: "0.8rem", padding: "0.8rem" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Versions</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "0.25rem" }}>{liveNoteCount}</div>
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border-blue)", borderRadius: "0.8rem", padding: "0.8rem" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Rating</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "0.25rem" }}>
                  {blockAvgRating != null ? `${blockAvgRating.toFixed(1)}` : "New"}
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>
                  {blockRatingCount > 0 ? `${blockRatingCount} review${blockRatingCount === 1 ? "" : "s"}` : "No reviews yet"}
                </div>
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border-blue)", borderRadius: "0.8rem", padding: "0.8rem" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Topics</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "0.25rem" }}>{topics.length}</div>
              </div>
            </div>

            {topics.length > 0 && (
              <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {topics.map((t) => (
                  <span key={t} className="seal" style={{ background: "var(--stone-light)", color: "var(--text-secondary)" }}>
                    {t}
                  </span>
                ))}
              </div>
            )}

            <h3 style={{ marginTop: "1.5rem", fontSize: "1.05rem" }}>
              <i className="fas fa-file-alt" style={{ color: "var(--text-info)" }}></i> Available versions
            </h3>

            {notes.length === 0 && (
              <p style={{ color: "var(--text-secondary)", marginTop: "0.6rem" }}>No live notes for this topic yet.</p>
            )}

            <div className="ledger-list" style={{ marginTop: "0.8rem" }}>
              {notes.map((n) => {
                const trustStyle = TRUST_STYLES[n.trustLevel] || TRUST_STYLES.NEW;
                return (
                  <div
                    key={n.noteId}
                    className="ledger-row"
                    style={
                      n.noteId === highlightNoteId
                        ? { background: "var(--bg-info)", borderColor: "var(--text-info)" }
                        : undefined
                    }
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.6rem" }}>
                    <div style={{ display: "flex", gap: "0.7rem", alignItems: "flex-start" }}>
                      <Avatar name={n.scribeName} imageUrl={n.scribeAvatarUrl} size="sm" />
                      <div>
                      {n.noteId === highlightNoteId && (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-info)", fontWeight: 600, marginBottom: "0.2rem" }}>
                          <i className="fas fa-share"></i> Shared with you
                        </div>
                      )}
                      <button
                        onClick={() => router.push(`/scribe/${n.scribeId}`)}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 600, color: "var(--text-primary)" }}
                      >
                        {n.scribeName}
                      </button>
                      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", marginTop: "0.3rem", flexWrap: "wrap" }}>
                        <span className="seal" style={{ background: trustStyle.bg, color: trustStyle.color }}>
                          {n.trustLabel}
                        </span>
                        {n.isRequestFulfillment && <span className="seal">Fixed request price</span>}
                        <button
                          onClick={() => setReviewsOpenFor((cur) => (cur === n.noteId ? null : n.noteId))}
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "0.8rem", color: "var(--text-secondary)", textDecoration: "underline" }}
                        >
                          <i className="fas fa-star" style={{ color: "var(--star)" }}></i>{" "}
                          {n.noteAvgRating != null ? `${n.noteAvgRating.toFixed(1)} (${n.noteRatingCount})` : "No ratings yet"}
                        </button>
                        <button
                          onClick={() => setReportingNoteId((cur) => (cur === n.noteId ? null : n.noteId))}
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "0.8rem", color: "var(--text-secondary)" }}
                        >
                          <i className="fas fa-flag"></i> Report this version
                        </button>
                        <span className="seal" style={{ background: "var(--bg-success)", color: "var(--text-success)" }}>
                          <i className="fas fa-shopping-cart"></i> {n.purchaseCount.toLocaleString()} bought
                        </span>
                        <button
                          onClick={() => setDetailsOpenFor((cur) => (cur === n.noteId ? null : n.noteId))}
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "0.8rem", color: "var(--text-secondary)" }}
                        >
                          <i className={`fas fa-chevron-${detailsOpenFor === n.noteId ? "up" : "down"}`}></i> Details
                        </button>
                      </div>
                      {detailsOpenFor === n.noteId && (
                        <div
                          style={{
                            marginTop: "0.5rem",
                            padding: "0.6rem 0.8rem",
                            background: "var(--stone-light)",
                            borderRadius: "0.5rem",
                            fontSize: "0.78rem",
                            color: "var(--text-secondary)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.25rem",
                          }}
                        >
                          <span>Uploaded {new Date(n.uploadedAt).toLocaleDateString()}</span>
                          <span>{n.pageCount != null ? `${n.pageCount} page${n.pageCount === 1 ? "" : "s"}` : "Page count not yet available"}</span>
                          <span>
                            {n.attestedOriginal ? (
                              <>
                                <i className="fas fa-check" style={{ color: "var(--text-success)" }}></i> Scribe attested this is
                                their own original work
                              </>
                            ) : (
                              "No originality attestation on file"
                            )}
                          </span>
                        </div>
                      )}
                      </div>
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

                    {reviewsOpenFor === n.noteId && (
                      <NoteReviews
                        noteId={n.noteId}
                        owned={n.owned}
                        purchaseId={n.purchaseId}
                        myReview={n.myReview}
                        onReviewed={(rating, comment) =>
                          setNotes((prev) => prev.map((note) => (note.noteId === n.noteId ? { ...note, myReview: { rating, comment } } : note)))
                        }
                      />
                    )}

                    {reportingNoteId === n.noteId && (
                      <form
                        onSubmit={(e) => handleNoteReportSubmit(e, n.noteId)}
                        style={{ borderTop: "1px solid var(--border-blue)", paddingTop: "0.7rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}
                      >
                        <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                          Why are you reporting {n.scribeName}&apos;s version specifically?
                        </label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                          {[
                            "Not genuine — looks copied from slides/a textbook, not real lecture notes",
                            "Incomplete or missing pages",
                            "Doesn't match what this block is supposed to cover",
                          ].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              className="btn"
                              style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
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
                          style={{ padding: "0.5rem", borderRadius: "0.6rem", border: "1px solid var(--border-blue)", fontFamily: "inherit", fontSize: "0.85rem", background: "var(--surface)", color: "var(--text-primary)" }}
                        />
                        <div style={{ display: "flex", gap: "0.6rem" }}>
                          <button className="btn btn-primary" type="submit" disabled={noteReportSubmitting}>
                            {noteReportSubmitting ? "Submitting..." : "Submit report"}
                          </button>
                          <button className="btn" type="button" onClick={() => setReportingNoteId(null)}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                    {noteReportStatus?.noteId === n.noteId && (
                      <p style={{ color: "var(--text-success)", fontSize: "0.8rem" }}>{noteReportStatus.message}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
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
    <div style={{ borderTop: "1px solid var(--border-blue)", paddingTop: "0.7rem" }}>
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

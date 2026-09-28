"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import PageHeader from "@/app/components/PageHeader";
import { SkeletonCard } from "@/app/components/Skeleton";
import { Icon } from "@/app/components/icons";
import { friendlyErrorMessage } from "@/lib/api-client";

interface Appeal {
  id: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submittedAt: string;
  reviewedAt: string | null;
}

const STATUS_STYLES: Record<Appeal["status"], { cls: string; label: string }> = {
  PENDING: { cls: "pending", label: "Pending review" },
  APPROVED: { cls: "paid", label: "Approved" },
  REJECTED: { cls: "rejected", label: "Not approved" },
};

export default function ScribeAppealPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [eligible, setEligible] = useState(false);
  const [appeal, setAppeal] = useState<Appeal | null>(null);
  const [canAppeal, setCanAppeal] = useState(false);
  const [retryAt, setRetryAt] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
      return;
    }
    load();
  }, [router]);

  function load() {
    setLoading(true);
    fetch("/api/scribe/appeal")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load appeal status");
        setEligible(data.eligible);
        setAppeal(data.appeal);
        setCanAppeal(data.canAppeal);
        setRetryAt(data.retryAt);
      })
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");

    if (reason.trim().length < 10) {
      setSubmitError("Tell us a bit more — at least 10 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/scribe/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.retryAt) setRetryAt(data.retryAt);
        throw new Error(data.error?.formErrors?.[0] || data.error || "Could not submit appeal");
      }

      setAppeal(data.appeal);
      setCanAppeal(false);
      setReason("");
    } catch (err) {
      setSubmitError(friendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const showForm = !loading && !error && eligible && canAppeal && (!appeal || appeal.status === "REJECTED");

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Scribe · Reinstatement"
        title="Appeal"
        accent="reinstatement"
        subtitle="Ask an admin to review your removal."
      />

      <div className="page-narrow">
        {loading && <SkeletonCard height="4.5rem" />}
        {error && <div className="auth-error">{error}</div>}

        {!loading && !error && !eligible && (
          <div className="panel">
            <h2 className="panel-title">{Icon.shield()} Nothing to appeal</h2>
            <p className="panel-desc" style={{ marginBottom: 0 }}>
              You haven&apos;t been removed as a Scribe, so there&apos;s nothing to appeal here. If you&apos;d like to become a
              Scribe for the first time, use{" "}
              <button type="button" className="text-link" onClick={() => router.push("/scribe/apply")}>
                the application page
              </button>{" "}
              instead.
            </p>
          </div>
        )}

        {!loading && !error && eligible && appeal && (
          <div className="panel mb-24">
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <h2 className="panel-title" style={{ marginBottom: 0 }}>{Icon.pen()} Your appeal</h2>
              <span className={`status ${STATUS_STYLES[appeal.status].cls}`}>{STATUS_STYLES[appeal.status].label}</span>
            </div>

            <div className="quote-block">&ldquo;{appeal.reason}&rdquo;</div>
            <div className="info-list" style={{ marginTop: 14 }}>
              <div className="info-row">
                <span className="k">Submitted</span>
                <span className="v">{new Date(appeal.submittedAt).toLocaleDateString()}</span>
              </div>
              {appeal.reviewedAt && (
                <div className="info-row">
                  <span className="k">Reviewed</span>
                  <span className="v">{new Date(appeal.reviewedAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>

            {appeal.status === "PENDING" && (
              <p className="panel-desc" style={{ margin: "14px 0 0" }}>An admin will review this soon — no need to submit another.</p>
            )}
            {appeal.status === "APPROVED" && (
              <p className="panel-desc" style={{ margin: "14px 0 0" }}>You&apos;re reinstated! Log out and back in to unlock your Scribe workspace again.</p>
            )}
            {appeal.status === "REJECTED" && !canAppeal && retryAt && (
              <p className="panel-desc" style={{ margin: "14px 0 0" }}>
                This appeal wasn&apos;t approved. You can submit another appeal on <strong>{new Date(retryAt).toLocaleDateString()}</strong>.
              </p>
            )}
          </div>
        )}

        {showForm && (
          <div className="panel">
            <h2 className="panel-title">{Icon.pen()} Tell us why you should be reinstated</h2>
            <p className="panel-desc">
              You can submit one appeal a month. Be specific about what changed and why you&apos;d like another chance as a Scribe.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="form-field">
                <label className="form-label" htmlFor="reason">Your appeal</label>
                <textarea
                  id="reason"
                  className="textarea"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={6}
                  placeholder="Explain what happened, what you've done differently since, and why you should get another chance..."
                />
              </div>
              {submitError && <div className="auth-error" style={{ marginBottom: 12 }}>{submitError}</div>}
              <div className="flex-end">
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  {submitting ? "Submitting..." : <>Submit appeal {Icon.arrow()}</>}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

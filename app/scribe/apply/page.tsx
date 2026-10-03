"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import PageHeader from "@/app/components/PageHeader";
import { SkeletonCard } from "@/app/components/Skeleton";
import { Icon } from "@/app/components/icons";
import { friendlyErrorMessage } from "@/lib/api-client";

interface Application {
  id: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submittedAt: string;
  reviewedAt: string | null;
}

const STATUS_STYLES: Record<Application["status"], { cls: string; label: string }> = {
  PENDING: { cls: "pending", label: "Pending review" },
  APPROVED: { cls: "paid", label: "Approved" },
  REJECTED: { cls: "rejected", label: "Not approved" },
};

export default function ScribeApplyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [application, setApplication] = useState<Application | null>(null);
  const [canApply, setCanApply] = useState(true);
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
    fetch("/api/scribe/apply")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load application status");
        if (data.eligible === false) {
          setCanApply(false);
          router.replace(data.demoted ? "/scribe/appeal" : getStoredUser()?.role === "SCRIBE" ? "/scribe" : "/dashboard");
          return;
        }
        setApplication(data.application);
        setCanApply(data.canApply);
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
      const res = await fetch("/api/scribe/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.retryAt) setRetryAt(data.retryAt);
        throw new Error(data.error?.formErrors?.[0] || data.error || "Could not submit application");
      }

      setApplication(data.application);
      setCanApply(false);
      setReason("");
    } catch (err) {
      setSubmitError(friendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  // Show the form when there's no application yet, OR the latest one was
  // rejected and the reapply cooldown has passed.
  const showForm = !loading && !error && canApply && (!application || application.status === "REJECTED");

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Scribe · Apply"
        title="Become a"
        accent="scribe"
        subtitle="Share your notes with other students and earn from them."
      />

      <div className="page-narrow">
        {loading && <SkeletonCard height="4.5rem" />}
        {error && <div className="auth-error">{error}</div>}

        {!loading && !error && application && (
          <div className="panel mb-24">
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <h2 className="panel-title" style={{ marginBottom: 0 }}>{Icon.pen()} Your application</h2>
              <span className={`status ${STATUS_STYLES[application.status].cls}`}>{STATUS_STYLES[application.status].label}</span>
            </div>

            <div className="form-label">Your reason for applying</div>
            <div className="quote-block">&ldquo;{application.reason}&rdquo;</div>
            <div className="info-list" style={{ marginTop: 14 }}>
              <div className="info-row">
                <span className="k">Submitted</span>
                <span className="v">{new Date(application.submittedAt).toLocaleDateString()}</span>
              </div>
              {application.reviewedAt && (
                <div className="info-row">
                  <span className="k">Reviewed</span>
                  <span className="v">{new Date(application.reviewedAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>

            {application.status === "PENDING" && (
              <p className="panel-desc" style={{ margin: "14px 0 0" }}>An admin will review this soon — no need to apply again.</p>
            )}
            {application.status === "APPROVED" && (
              <p className="panel-desc" style={{ margin: "14px 0 0" }}>You&apos;re approved! Log out and back in to unlock your Scribe workspace.</p>
            )}
            {application.status === "REJECTED" && !canApply && retryAt && (
              <p className="panel-desc" style={{ margin: "14px 0 0" }}>
                This application wasn&apos;t approved. You can apply again on <strong>{new Date(retryAt).toLocaleDateString()}</strong>.
              </p>
            )}
          </div>
        )}

        {showForm && (
          <div className="panel">
            <h2 className="panel-title">{Icon.pen()} Why do you want to be a scribe?</h2>
            <p className="panel-desc">
              Tell an admin a bit about yourself and why you&apos;d be a good fit — this is what they&apos;ll see when reviewing your application.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="form-field">
                <label className="form-label" htmlFor="reason">Your reason</label>
                <textarea
                  id="reason"
                  className="textarea"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={6}
                  placeholder="e.g. I've taken detailed notes for COS 201 all semester and want to share them, plus help other students who are struggling with..."
                />
              </div>
              {submitError && <div className="auth-error" style={{ marginBottom: 12 }}>{submitError}</div>}
              <div className="flex-end">
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  {submitting ? "Submitting..." : <>Submit application {Icon.arrow()}</>}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

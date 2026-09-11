"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import ProfileMenu from "@/app/components/ProfileMenu";
import { SkeletonCard } from "@/app/components/Skeleton";
import Logo from "@/app/components/Logo";
import { friendlyErrorMessage } from "@/lib/api-client";

interface Appeal {
  id: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submittedAt: string;
  reviewedAt: string | null;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string; icon: string }> = {
  PENDING: { bg: "var(--bg-warning)", color: "var(--text-warning)", label: "Pending review", icon: "fa-hourglass-half" },
  APPROVED: { bg: "var(--bg-success)", color: "var(--text-success)", label: "Approved", icon: "fa-check-circle" },
  REJECTED: { bg: "var(--bg-danger)", color: "var(--text-danger)", label: "Not approved", icon: "fa-times-circle" },
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
      <div className="app-container" style={{ maxWidth: 560 }}>
        <div className="top-bar">
          <div className="logo" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Logo size={34} />
            <div>
              <h1>
                Veloce <span className="accent">.</span>
              </h1>
              <div className="logo-sub">Appeal reinstatement</div>
            </div>
          </div>
          <ProfileMenu />
        </div>

        {loading && <div style={{ marginTop: "1rem" }}><SkeletonCard height="4.5rem" /></div>}
        {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}

        {!loading && !error && !eligible && (
          <p style={{ color: "var(--text-secondary)", marginTop: "1.5rem" }}>
            You haven't been removed as a Scribe, so there's nothing to appeal here. If you'd like to become a
            Scribe for the first time, use{" "}
            <button
              onClick={() => router.push("/scribe/apply")}
              style={{ background: "none", border: "none", padding: 0, color: "var(--text-info)", cursor: "pointer", textDecoration: "underline" }}
            >
              the application page
            </button>{" "}
            instead.
          </p>
        )}

        {!loading && !error && eligible && appeal && (
          <div style={{ marginTop: "1.5rem" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                background: STATUS_STYLES[appeal.status].bg,
                color: STATUS_STYLES[appeal.status].color,
                padding: "0.4rem 1rem",
                borderRadius: "30px",
                fontSize: "0.85rem",
                fontWeight: 600,
              }}
            >
              <i className={`fas ${STATUS_STYLES[appeal.status].icon}`}></i>
              {STATUS_STYLES[appeal.status].label}
            </span>

            <div style={{ marginTop: "1.2rem", background: "var(--surface)", border: "1px solid var(--border-blue)", borderRadius: "1rem", padding: "1.2rem" }}>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>Your appeal:</div>
              <p style={{ fontSize: "0.9rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>&ldquo;{appeal.reason}&rdquo;</p>
              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "1rem" }}>
                Submitted {new Date(appeal.submittedAt).toLocaleDateString()}
                {appeal.reviewedAt && ` · Reviewed ${new Date(appeal.reviewedAt).toLocaleDateString()}`}
              </div>
            </div>

            {appeal.status === "PENDING" && (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "1rem" }}>
                An admin will review this soon — no need to submit another.
              </p>
            )}
            {appeal.status === "APPROVED" && (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "1rem" }}>
                You're reinstated! Log out and back in to unlock your Scribe workspace again.
              </p>
            )}
            {appeal.status === "REJECTED" && !canAppeal && retryAt && (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "1rem" }}>
                This appeal wasn't approved. You can submit another appeal on{" "}
                <strong>{new Date(retryAt).toLocaleDateString()}</strong>.
              </p>
            )}
          </div>
        )}

        {showForm && (
          <div style={{ marginTop: "1.5rem" }}>
            <h2>
              <i className="fas fa-undo" style={{ color: "var(--text-info)" }}></i> Tell us why you should be reinstated
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.4rem" }}>
              You can submit one appeal a month. Be specific about what changed and why you'd like another
              chance as a Scribe.
            </p>

            <form onSubmit={handleSubmit} style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={6}
                placeholder="Explain what happened, what you've done differently since, and why you should get another chance..."
                style={{
                  padding: "0.7rem",
                  borderRadius: "0.7rem",
                  border: "1px solid var(--border-blue)",
                  fontFamily: "inherit",
                  fontSize: "0.9rem",
                }}
              />
              {submitError && <div className="auth-error">{submitError}</div>}
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit appeal"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

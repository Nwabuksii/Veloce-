"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import ProfileMenu from "@/app/components/ProfileMenu";
import Logo from "@/app/components/Logo";
import { friendlyErrorMessage } from "@/lib/api-client";

interface Application {
  id: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submittedAt: string;
  reviewedAt: string | null;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string; icon: string }> = {
  PENDING: { bg: "#fdf3e3", color: "#a5690a", label: "Pending review", icon: "fa-hourglass-half" },
  APPROVED: { bg: "#e7f6ec", color: "#1b7e4a", label: "Approved", icon: "fa-check-circle" },
  REJECTED: { bg: "#fdecec", color: "#b13e3e", label: "Not approved", icon: "fa-times-circle" },
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
      <div className="app-container" style={{ maxWidth: 560 }}>
        <div className="top-bar">
          <div className="logo" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Logo size={34} />
            <div>
              <h1>
                Veloce <span className="accent">.</span>
              </h1>
              <div className="logo-sub">Become a scribe</div>
            </div>
          </div>
          <ProfileMenu />
        </div>

        {loading && <p style={{ color: "#5e7188", marginTop: "1rem" }}>Loading...</p>}
        {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}

        {!loading && !error && application && (
          <div style={{ marginTop: "1.5rem" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                background: STATUS_STYLES[application.status].bg,
                color: STATUS_STYLES[application.status].color,
                padding: "0.4rem 1rem",
                borderRadius: "30px",
                fontSize: "0.85rem",
                fontWeight: 600,
              }}
            >
              <i className={`fas ${STATUS_STYLES[application.status].icon}`}></i>
              {STATUS_STYLES[application.status].label}
            </span>

            <div style={{ marginTop: "1.2rem", background: "white", border: "1px solid #e1e8f0", borderRadius: "1rem", padding: "1.2rem" }}>
              <div style={{ fontSize: "0.8rem", color: "#5e7188", marginBottom: "0.4rem" }}>Your reason for applying:</div>
              <p style={{ fontSize: "0.9rem", color: "#1a2b3c", whiteSpace: "pre-wrap" }}>&ldquo;{application.reason}&rdquo;</p>
              <div style={{ fontSize: "0.78rem", color: "#5e7188", marginTop: "1rem" }}>
                Submitted {new Date(application.submittedAt).toLocaleDateString()}
                {application.reviewedAt && ` · Reviewed ${new Date(application.reviewedAt).toLocaleDateString()}`}
              </div>
            </div>

            {application.status === "PENDING" && (
              <p style={{ color: "#5e7188", fontSize: "0.85rem", marginTop: "1rem" }}>
                An admin will review this soon — no need to apply again.
              </p>
            )}
            {application.status === "APPROVED" && (
              <p style={{ color: "#5e7188", fontSize: "0.85rem", marginTop: "1rem" }}>
                You're approved! Log out and back in to unlock your Scribe workspace.
              </p>
            )}
            {application.status === "REJECTED" && !canApply && retryAt && (
              <p style={{ color: "#5e7188", fontSize: "0.85rem", marginTop: "1rem" }}>
                This application wasn't approved. You can apply again on{" "}
                <strong>{new Date(retryAt).toLocaleDateString()}</strong>.
              </p>
            )}
          </div>
        )}

        {showForm && (
          <div style={{ marginTop: "1.5rem" }}>
            <h2>
              <i className="fas fa-pen-fancy" style={{ color: "#2a7de1" }}></i> Why do you want to be a scribe?
            </h2>
            <p style={{ color: "#5e7188", fontSize: "0.85rem", marginTop: "0.4rem" }}>
              Tell an admin a bit about yourself and why you'd be a good fit — this is what they'll see when
              reviewing your application.
            </p>

            <form onSubmit={handleSubmit} style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={6}
                placeholder="e.g. I've taken detailed notes for COS 201 all semester and want to share them, plus help other students who are struggling with..."
                style={{
                  padding: "0.7rem",
                  borderRadius: "0.7rem",
                  border: "1px solid #d0dae8",
                  fontFamily: "inherit",
                  fontSize: "0.9rem",
                }}
              />
              {submitError && <div className="auth-error">{submitError}</div>}
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit application"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

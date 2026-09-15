"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export default function FeedbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!getStoredUser()) router.push("/login");
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Write something first.");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });
      setSent(true);
      setMessage("");
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
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
              <div className="logo-sub">Feedback</div>
            </div>
          </div>
          <ProfileMenu />
        </div>

        <div style={{ marginTop: "1.5rem", maxWidth: 480 }}>
          <h2>
            <i className="fas fa-comment-dots" style={{ color: "var(--text-info)" }}></i> What do you think of the
            site?
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "0.3rem" }}>
            Bugs, ideas, complaints, praise — whatever's on your mind. It goes straight to the admins.
          </p>

          {sent ? (
            <div
              style={{
                marginTop: "1.2rem",
                background: "var(--surface)",
                border: "1px solid var(--border-blue)",
                borderRadius: "12px",
                padding: "1.2rem",
              }}
            >
              <p style={{ fontWeight: 600 }}>
                <i className="fas fa-check-circle" style={{ color: "var(--text-success)" }}></i> Thanks — sent.
              </p>
              <button className="btn press-on-tap" style={{ marginTop: "0.8rem" }} onClick={() => setSent(false)}>
                Send more feedback
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ marginTop: "1rem" }}>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                placeholder="Tell us what's working, what isn't, or what you'd like to see..."
                style={{
                  width: "100%",
                  padding: "0.7rem",
                  borderRadius: "10px",
                  border: "1px solid var(--border-blue)",
                  fontFamily: "inherit",
                  fontSize: "0.9rem",
                  background: "var(--surface)",
                  color: "var(--text-primary)",
                }}
              />
              <button className="btn btn-primary press-on-tap" style={{ marginTop: "0.8rem" }} disabled={submitting}>
                {submitting ? "Sending..." : "Send feedback"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

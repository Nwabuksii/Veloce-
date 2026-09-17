"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import Avatar from "@/app/components/Avatar";
import { SkeletonList } from "@/app/components/Skeleton";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";

interface FeedbackItem {
  id: string;
  message: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  authorAvatarUrl: string | null;
}

export default function AdminFeedbackPage() {
  const router = useRouter();
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
      return;
    }
    if (user.role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }

    // Clear the "unseen feedback" badge — this admin has now opened the page.
    apiFetch("/api/admin/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "feedback" }),
    }).catch(() => {});

    apiFetch("/api/feedback")
      .then((data) => setFeedback(data.feedback))
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [router]);

  function startReply(id: string) {
    setReplyingId((cur) => (cur === id ? null : id));
    setReplyText("");
  }

  async function sendReply(recipientId: string) {
    if (replyText.trim().length < 2) {
      toast.error("Write a message first.");
      return;
    }
    setReplySending(true);
    try {
      await apiFetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience: "individual",
          recipientId,
          subject: "Re: your feedback",
          body: replyText.trim(),
        }),
      });
      toast.success("Reply sent.");
      setReplyingId(null);
      setReplyText("");
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setReplySending(false);
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
              <div className="logo-sub">Feedback inbox</div>
            </div>
          </div>
          <ProfileMenu />
        </div>

        <div style={{ marginTop: "1.5rem" }}>
          <h2>
            <i className="fas fa-comment-dots" style={{ color: "var(--text-info)" }}></i> What people are saying
          </h2>

          {loading ? (
            <SkeletonList rows={4} />
          ) : error ? (
            <p style={{ color: "var(--text-danger)", marginTop: "1rem" }}>{error}</p>
          ) : feedback.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", marginTop: "1rem" }}>No feedback yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem", marginTop: "1rem" }}>
              {feedback.map((f) => (
                <div
                  key={f.id}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border-blue)",
                    borderRadius: "12px",
                    padding: "1rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Avatar name={f.authorName} size="sm" imageUrl={f.authorAvatarUrl} />
                      {f.authorName} · {f.authorRole}
                    </span>
                    <span>{new Date(f.createdAt).toLocaleString()}</span>
                  </div>
                  <p style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap" }}>{f.message}</p>

                  <button className="btn" style={{ marginTop: "0.6rem", padding: "0.25rem 0.7rem", fontSize: "0.78rem" }} onClick={() => startReply(f.id)}>
                    <i className="fas fa-reply"></i> Reply
                  </button>

                  {replyingId === f.id && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        rows={2}
                        placeholder={`Reply to ${f.authorName}...`}
                        style={{
                          padding: "0.5rem",
                          borderRadius: "10px",
                          border: "1px solid var(--border-blue)",
                          fontFamily: "inherit",
                          fontSize: "0.85rem",
                          background: "var(--surface)",
                          color: "var(--text-primary)",
                        }}
                      />
                      <div style={{ display: "flex", gap: "0.6rem" }}>
                        <button className="btn btn-primary press-on-tap" disabled={replySending} onClick={() => sendReply(f.authorId)}>
                          {replySending ? "Sending..." : "Send"}
                        </button>
                        <button className="btn" type="button" onClick={() => setReplyingId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

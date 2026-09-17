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
  const [replyBody, setReplyBody] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  async function sendReply(f: FeedbackItem) {
    if (!replyBody.trim()) {
      toast.error("Write a reply first.");
      return;
    }
    setSendingReply(true);
    try {
      await apiFetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience: "individual",
          recipientId: f.authorId,
          subject: "Re: your feedback",
          body: replyBody.trim(),
        }),
      });
      toast.success(`Reply sent to ${f.authorName}.`);
      setReplyingId(null);
      setReplyBody("");
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setSendingReply(false);
    }
  }

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
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
                      <Avatar name={f.authorName} imageUrl={f.authorAvatarUrl} size="sm" />
                      {f.authorName} · {f.authorRole}
                    </span>
                    <span>{new Date(f.createdAt).toLocaleString()}</span>
                  </div>
                  <p style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap" }}>{f.message}</p>

                  {replyingId === f.id ? (
                    <div style={{ marginTop: "0.7rem" }}>
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        rows={3}
                        placeholder={`Reply to ${f.authorName}...`}
                        style={{ width: "100%", padding: "0.6rem", borderRadius: "8px", border: "1px solid var(--border-blue)", fontFamily: "inherit" }}
                      />
                      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                        <button className="btn btn-primary press-on-tap" disabled={sendingReply} onClick={() => sendReply(f)}>
                          {sendingReply ? "Sending..." : "Send reply"}
                        </button>
                        <button className="btn press-on-tap" onClick={() => { setReplyingId(null); setReplyBody(""); }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="btn press-on-tap"
                      style={{ marginTop: "0.7rem" }}
                      onClick={() => { setReplyingId(f.id); setReplyBody(""); }}
                    >
                      <i className="fas fa-reply"></i> Reply
                    </button>
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

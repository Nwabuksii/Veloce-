"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
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
      <AdminPageHeader section="Voice of user" title="Feedback" serif="inbox" subtitle="What students and scribes are telling us — praise, suggestions and bugs.">
        <button className="btn btn-ghost" onClick={() => router.push("/admin")}>
          {AIcon.back()} Admin
        </button>
      </AdminPageHeader>

      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <div className="auth-error">{error}</div>
      ) : feedback.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">{AIcon.message()}</div>
          <h3 className="empty-title">No feedback yet</h3>
          <p className="empty-desc">When people send feedback it will show up here.</p>
        </div>
      ) : (
        <div className="stack-10">
          {feedback.map((f) => (
            <div key={f.id} className="panel">
              <div className="feedback-head">
                <div className="person-name-row" style={{ marginBottom: 0 }}>
                  <Avatar name={f.authorName} imageUrl={f.authorAvatarUrl} size="sm" />
                  <span className="person-name">{f.authorName}</span>
                  <span className="status">{f.authorRole}</span>
                </div>
                <div className="request-meta">
                  <span>{AIcon.clock()} {new Date(f.createdAt).toLocaleString()}</span>
                </div>
              </div>
              <p className="feedback-body">{f.message}</p>

              {replyingId === f.id ? (
                <div className="request-extra">
                  <textarea
                    className="textarea"
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    rows={3}
                    placeholder={`Reply to ${f.authorName}...`}
                  />
                  <div className="form-actions">
                    <button className="btn btn-primary press-on-tap" disabled={sendingReply} onClick={() => sendReply(f)}>
                      {sendingReply ? "Sending..." : "Send reply"}
                    </button>
                    <button
                      className="btn btn-ghost press-on-tap"
                      onClick={() => {
                        setReplyingId(null);
                        setReplyBody("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="request-extra">
                  <div className="form-actions">
                    <button
                      className="btn btn-ghost press-on-tap"
                      onClick={() => {
                        setReplyingId(f.id);
                        setReplyBody("");
                      }}
                    >
                      {AIcon.reply()} Reply
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

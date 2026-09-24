"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import PageHeader from "@/app/components/PageHeader";
import { SkeletonList } from "@/app/components/Skeleton";
import { friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";

interface PollOptionView {
  id: string;
  label: string;
  votes: number;
}
interface MessageView {
  id: string;
  subject: string;
  body: string;
  senderName: string;
  readAt: string | null;
  createdAt: string;
  type: "TEXT" | "POLL";
  priority: "NORMAL" | "SERIOUS";
  poll: { myOptionId: string | null; totalVotes: number; options: PollOptionView[] } | null;
}

export default function MessagesPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [voting, setVoting] = useState<string | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
      return;
    }

    fetch("/api/messages")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load messages");
        setMessages(data.messages);
      })
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleVote(messageId: string, optionId: string) {
    setVoting(messageId);
    try {
      const res = await fetch(`/api/messages/${messageId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not vote");

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId && msg.poll
            ? {
                ...msg,
                readAt: msg.readAt ?? new Date().toISOString(),
                poll: {
                  myOptionId: optionId,
                  totalVotes: msg.poll.totalVotes + 1,
                  options: msg.poll.options.map((o) => (o.id === optionId ? { ...o, votes: o.votes + 1 } : o)),
                },
              }
            : msg
        )
      );
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setVoting(null);
    }
  }

  async function handleOpen(m: MessageView) {
    setExpandedId(expandedId === m.id ? null : m.id);

    if (!m.readAt) {
      try {
        await fetch(`/api/messages/${m.id}/read`, { method: "POST" });
        setMessages((prev) => prev.map((msg) => (msg.id === m.id ? { ...msg, readAt: new Date().toISOString() } : msg)));
      } catch {
        // non-critical
      }
    }
  }

  return (
    <div className="page-wrap">
      <div className="app-container">
        <PageHeader title="Messages" subtitle="Your inbox." />

        {loading && <SkeletonList rows={3} />}
        {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}
        {!loading && !error && messages.length === 0 && (
          <p style={{ color: "var(--text-secondary)", marginTop: "1rem" }}>No messages yet.</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "1rem" }}>
          {messages.map((m) => (
            <div
              key={m.id}
              onClick={() => handleOpen(m)}
              style={{
                background: "var(--surface)",
                border: m.readAt ? "1px solid var(--border-blue)" : "1px solid var(--text-info)",
                borderRadius: "12px",
                padding: "1rem 1.2rem",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                <strong style={{ fontWeight: m.readAt ? 500 : 700 }}>
                  {!m.readAt && (
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--text-info)", marginRight: "0.5rem" }}></span>
                  )}
                  {m.subject}
                </strong>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  {m.type === "POLL" && (
                    <span className="pill pill-info">
                      <i className="fas fa-square-poll-vertical"></i> Poll
                    </span>
                  )}
                  {m.priority === "SERIOUS" && (
                    <span className="pill" style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}>
                      Serious
                    </span>
                  )}
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{new Date(m.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>From {m.senderName}</div>
              {expandedId === m.id && (
                <>
                  <p style={{ marginTop: "0.7rem", fontSize: "0.9rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{m.body}</p>

                  {m.type === "POLL" && m.poll && (
                    <div
                      style={{ marginTop: "0.7rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {m.poll.options.map((o) => {
                        const voted = m.poll!.myOptionId !== null;
                        const pct = m.poll!.totalVotes > 0 ? Math.round((o.votes / m.poll!.totalVotes) * 100) : 0;
                        const isMine = m.poll!.myOptionId === o.id;
                        return voted ? (
                          <div
                            key={o.id}
                            style={{
                              position: "relative",
                              padding: "0.5rem 0.7rem",
                              borderRadius: "0.5rem",
                              border: `1px solid ${isMine ? "var(--accent)" : "var(--border-blue)"}`,
                              overflow: "hidden",
                              fontSize: "0.85rem",
                            }}
                          >
                            <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "var(--bg-info)", zIndex: 0 }} />
                            <div style={{ position: "relative", display: "flex", justifyContent: "space-between" }}>
                              <span>
                                {o.label} {isMine && <i className="fas fa-check" style={{ color: "var(--text-info)" }}></i>}
                              </span>
                              <span>
                                {pct}% ({o.votes})
                              </span>
                            </div>
                          </div>
                        ) : (
                          <button
                            key={o.id}
                            type="button"
                            disabled={voting === m.id}
                            onClick={() => handleVote(m.id, o.id)}
                            className="btn"
                            style={{ textAlign: "left", justifyContent: "flex-start" }}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                      <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                        {m.poll.totalVotes} vote{m.poll.totalVotes === 1 ? "" : "s"} so far
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

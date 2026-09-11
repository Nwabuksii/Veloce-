"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { SkeletonList } from "@/app/components/Skeleton";
import { friendlyErrorMessage } from "@/lib/api-client";

interface MessageView {
  id: string;
  subject: string;
  body: string;
  senderName: string;
  readAt: string | null;
  createdAt: string;
}

export default function MessagesPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
        <div className="top-bar">
          <div className="logo" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Logo size={34} />
            <div>
              <h1>
                Veloce <span className="accent">.</span>
              </h1>
              <div className="logo-sub">Messages</div>
            </div>
          </div>
          <ProfileMenu />
        </div>

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
                borderRadius: "1rem",
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
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{new Date(m.createdAt).toLocaleDateString()}</span>
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>From {m.senderName}</div>
              {expandedId === m.id && (
                <p style={{ marginTop: "0.7rem", fontSize: "0.9rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{m.body}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

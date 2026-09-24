"use client";

import { useEffect, useState } from "react";

interface PollOption {
  id: string;
  label: string;
}
interface BlockingItem {
  id: string;
  subject: string;
  body: string;
  senderName: string;
  type: "TEXT" | "POLL";
  priority: "NORMAL" | "SERIOUS";
  options?: PollOption[];
}

/**
 * A full-screen, non-dismissible gate — no backdrop click, no Escape, no
 * close button — shown by SiteChrome whenever the person has an unread
 * SERIOUS message or an un-voted poll waiting for them. One item at a
 * time; acknowledging or voting reveals the next until the list is empty,
 * at which point `onClear` unmounts this and the rest of the app becomes
 * reachable again.
 */
export default function BlockingMessageModal({ onClear }: { onClear: () => void }) {
  const [items, setItems] = useState<BlockingItem[] | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  function load() {
    fetch("/api/messages/blocking")
      .then((res) => res.json())
      .then((data) => {
        const list: BlockingItem[] = data.messages || [];
        setItems(list);
        setSelectedOption(null);
        if (list.length === 0) onComplete();
      })
      .catch(() => setError("Couldn't check for messages — refresh to try again."));
  }

  function onComplete() {
    onClear();
  }

  async function acknowledge(item: BlockingItem) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/messages/${item.id}/read`, { method: "POST" });
      if (!res.ok) throw new Error();
      load();
    } catch {
      setError("Couldn't mark this as read — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function vote(item: BlockingItem) {
    if (!selectedOption) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/messages/${item.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId: selectedOption }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not vote");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not vote — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!items || items.length === 0) return null;
  const item = items[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.type === "POLL" ? "Poll" : "Important message"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "var(--overlay)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "1rem",
          boxShadow: "var(--menu-shadow)",
          padding: "2rem",
          width: "100%",
          maxWidth: 440,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
          {item.type === "POLL" ? (
            <span className="pill pill-info">
              <i className="fas fa-square-poll-vertical"></i> Poll
            </span>
          ) : (
            <span className="pill" style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}>
              <i className="fas fa-triangle-exclamation"></i> Important
            </span>
          )}
          {items.length > 1 && (
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>1 of {items.length}</span>
          )}
        </div>

        <h2>{item.subject}</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.2rem" }}>From {item.senderName}</p>
        <p style={{ marginTop: "0.8rem", fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>{item.body}</p>

        {item.type === "POLL" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1.2rem" }}>
            {(item.options ?? []).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setSelectedOption(o.id)}
                style={{
                  textAlign: "left",
                  padding: "0.6rem 0.8rem",
                  borderRadius: "0.6rem",
                  border: `1px solid ${selectedOption === o.id ? "var(--accent)" : "var(--border)"}`,
                  background: selectedOption === o.id ? "var(--bg-info)" : "var(--surface)",
                  cursor: "pointer",
                  fontSize: "0.88rem",
                }}
              >
                {o.label}
              </button>
            ))}
            {error && <div className="auth-error">{error}</div>}
            <button className="btn btn-primary btn-block" style={{ marginTop: "0.4rem" }} disabled={!selectedOption || busy} onClick={() => vote(item)}>
              {busy ? "Submitting..." : "Vote"}
            </button>
          </div>
        ) : (
          <>
            {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}
            <button className="btn btn-primary btn-block" style={{ marginTop: "1.2rem" }} disabled={busy} onClick={() => acknowledge(item)}>
              {busy ? "..." : "I understand"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { SkeletonList } from "@/app/components/Skeleton";
import { friendlyErrorMessage } from "@/lib/api-client";

interface UserOption {
  id: string;
  fullName: string;
  email: string;
  role: string;
}
interface SentMessage {
  subject: string;
  body: string;
  recipientCount: number;
  recipientSummary: string;
  createdAt: string;
}

type Role = "STUDENT" | "SCRIBE" | "ADMIN";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "STUDENT", label: "Students" },
  { value: "SCRIBE", label: "Scribes" },
  { value: "ADMIN", label: "Admins" },
];

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "0.6rem",
  marginTop: "0.4rem",
  borderRadius: "0.7rem",
  border: "1px solid var(--border-blue)",
};

export default function AdminMessagesPage() {
  const router = useRouter();

  const [audience, setAudience] = useState<"individual" | "group">("individual");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserOption[]>([]);
  const [recipient, setRecipient] = useState<UserOption | null>(null);

  const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
  const allChecked = selectedRoles.length === ROLE_OPTIONS.length;

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([]);
  const [loadingSent, setLoadingSent] = useState(true);

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
    loadSent();
  }, [router]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/admin/users/search?q=${encodeURIComponent(query.trim())}`)
        .then((res) => res.json())
        .then((data) => setResults(data.users || []))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function loadSent() {
    setLoadingSent(true);
    try {
      const res = await fetch("/api/admin/messages");
      const data = await res.json();
      setSentMessages(data.messages || []);
    } finally {
      setLoadingSent(false);
    }
  }

  function toggleRole(role: Role) {
    setSelectedRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function toggleAll() {
    setSelectedRoles(allChecked ? [] : ROLE_OPTIONS.map((r) => r.value));
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();

    if (audience === "individual" && !recipient) {
      setStatus("Pick a recipient first.");
      return;
    }
    if (audience === "group" && selectedRoles.length === 0) {
      setStatus("Check at least one audience group.");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setStatus("Fill in both a subject and a message.");
      return;
    }

    setSending(true);
    setStatus("");
    try {
      const payload =
        audience === "individual"
          ? { audience, recipientId: recipient!.id, subject: subject.trim(), body: body.trim() }
          : { audience, roles: selectedRoles, subject: subject.trim(), body: body.trim() };

      const res = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.formErrors?.[0] || data.error || "Could not send message");

      setStatus(
        audience === "individual"
          ? `Sent to ${recipient!.fullName}.`
          : `Sent to ${data.sentCount} recipient${data.sentCount === 1 ? "" : "s"}.`
      );
      setRecipient(null);
      setSelectedRoles([]);
      setQuery("");
      setSubject("");
      setBody("");
      loadSent();
    } catch (err) {
      setStatus(friendlyErrorMessage(err));
    } finally {
      setSending(false);
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
              <div className="logo-sub">Message users</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="btn" onClick={() => router.push("/admin")}>
              <i className="fas fa-arrow-left"></i> Applications
            </button>
            <ProfileMenu />
          </div>
        </div>

        <div style={{ marginTop: "1.5rem", maxWidth: 520 }}>
          <form onSubmit={handleSend} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button
                type="button"
                className={`btn ${audience === "individual" ? "btn-primary" : ""}`}
                onClick={() => setAudience("individual")}
              >
                Specific person
              </button>
              <button
                type="button"
                className={`btn ${audience === "group" ? "btn-primary" : ""}`}
                onClick={() => setAudience("group")}
              >
                Group broadcast
              </button>
            </div>

            {audience === "individual" && (
              <div style={{ position: "relative" }}>
                {!recipient ? (
                  <>
                    <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                      Who's this for?
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search name or email..."
                        style={inputStyle}
                      />
                    </label>
                    {results.length > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          right: 0,
                          background: "var(--surface)",
                          border: "1px solid var(--border-blue)",
                          borderRadius: "0.8rem",
                          marginTop: "0.3rem",
                          zIndex: 10,
                          boxShadow: "0 8px 20px -8px rgba(0,20,40,0.18)",
                        }}
                      >
                        {results.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setRecipient(u);
                              setResults([]);
                            }}
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              padding: "0.6rem 0.8rem",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontSize: "0.85rem",
                            }}
                          >
                            <strong>{u.fullName}</strong> · {u.role}
                            <div style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>{u.email}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    style={{
                      background: "var(--bg-info)",
                      borderRadius: "0.8rem",
                      padding: "0.7rem 1rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <strong>{recipient.fullName}</strong>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{recipient.email}</div>
                    </div>
                    <button type="button" className="btn" onClick={() => setRecipient(null)}>
                      Change
                    </button>
                  </div>
                )}
              </div>
            )}

            {audience === "group" && (
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border-blue)",
                  borderRadius: "0.8rem",
                  padding: "0.8rem 1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem", fontWeight: 600 }}>
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                  All users
                </label>
                <div style={{ height: "1px", background: "var(--bg-info)" }} />
                {ROLE_OPTIONS.map((opt) => (
                  <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem" }}>
                    <input type="checkbox" checked={selectedRoles.includes(opt.value)} onChange={() => toggleRole(opt.value)} />
                    {opt.label}
                  </label>
                ))}
              </div>
            )}

            <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>
              Subject
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} style={inputStyle} />
            </label>

            <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>
              Message
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                style={{ ...inputStyle, fontFamily: "inherit" }}
              />
            </label>

            {status && <p style={{ color: status.startsWith("Sent") ? "var(--text-success)" : "var(--text-danger)" }}>{status}</p>}

            <button className="btn btn-primary" type="submit" disabled={sending}>
              {sending ? "Sending..." : "Send message"}
            </button>
          </form>
        </div>

        <h2 style={{ marginTop: "2rem" }}>
          <i className="fas fa-paper-plane" style={{ color: "var(--text-info)" }}></i> Recently sent
        </h2>

        {loadingSent && <SkeletonList rows={3} />}
        {!loadingSent && sentMessages.length === 0 && (
          <p style={{ color: "var(--text-secondary)", marginTop: "0.6rem" }}>Nothing sent yet.</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.8rem" }}>
          {sentMessages.map((m, i) => (
            <div
              key={`${m.subject}-${m.createdAt}-${i}`}
              style={{ background: "var(--surface)", border: "1px solid var(--border-blue)", borderRadius: "0.9rem", padding: "0.8rem 1rem" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                <strong style={{ fontSize: "0.9rem" }}>{m.subject}</strong>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  {new Date(m.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                To {m.recipientCount === 1 ? m.recipientSummary : `${m.recipientCount} recipients — ${m.recipientSummary}`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { friendlyErrorMessage } from "@/lib/api-client";

interface FlaggedNote {
  id: string;
  similarityScore: number | null;
  qualityScore: number | null;
  block: { title: string; course: { code: string } };
  scribe: { fullName: string; email: string };
}

export default function ModerationPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<FlaggedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

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

    load();
  }, [router]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/notes");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setNotes(data.notes);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDecision(id: string, decision: "approve" | "reject") {
    setActionMessage("");

    try {
      const res = await fetch(`/api/admin/notes/${id}/${decision}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Could not ${decision}`);

      setActionMessage(`Note ${decision}d.`);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      setActionMessage(friendlyErrorMessage(err));
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
              <div className="logo-sub">Content moderation queue</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="btn" onClick={() => router.push("/admin")}>
              <i className="fas fa-arrow-left"></i> Applications
            </button>
            <ProfileMenu />
          </div>
        </div>

        <div style={{ marginTop: "1.5rem" }}>
          {loading && <p style={{ color: "#5e7188" }}>Loading...</p>}
          {error && <div className="auth-error">{error}</div>}
          {actionMessage && <p style={{ color: "#1b7e4a" }}>{actionMessage}</p>}
          {!loading && !error && notes.length === 0 && (
            <p style={{ color: "#5e7188" }}>Nothing flagged right now.</p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", marginTop: "1rem" }}>
            {notes.map((n) => (
              <div key={n.id} style={{ background: "white", border: "1px solid #e1e8f0", borderRadius: "1rem", padding: "1rem" }}>
                <strong>
                  {n.block.course.code} — {n.block.title}
                </strong>
                <div style={{ fontSize: "0.85rem", color: "#5e7188", margin: "0.3rem 0" }}>
                  By {n.scribe.fullName} ({n.scribe.email})
                </div>
                <div style={{ fontSize: "0.8rem", color: "#5e7188" }}>
                  Similarity: {n.similarityScore != null ? `${Math.round(n.similarityScore * 100)}%` : "—"} · Quality:{" "}
                  {n.qualityScore != null ? `${Math.round(n.qualityScore * 100)}%` : "—"}
                </div>
                <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.8rem" }}>
                  <button
                    className="btn"
                    onClick={() => router.push(`/notes/${n.id}/read`)}
                  >
                    <i className="fas fa-eye"></i> Preview
                  </button>
                  <button
                    className="btn"
                    style={{ background: "#1b7e4a", borderColor: "#1b7e4a", color: "white" }}
                    onClick={() => handleDecision(n.id, "approve")}
                  >
                    <i className="fas fa-check"></i> Approve
                  </button>
                  <button
                    className="btn"
                    style={{ background: "#b13e3e", borderColor: "#b13e3e", color: "white" }}
                    onClick={() => handleDecision(n.id, "reject")}
                  >
                    <i className="fas fa-times"></i> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

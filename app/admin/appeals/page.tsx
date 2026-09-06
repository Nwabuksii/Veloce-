"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import ProfileMenu from "@/app/components/ProfileMenu";
import Logo from "@/app/components/Logo";
import { friendlyErrorMessage } from "@/lib/api-client";

interface Appeal {
  id: string;
  reason: string;
  status: string;
  submittedAt: string;
  user: { id: string; fullName: string; email: string; level?: string; demotedAt: string | null };
}

export default function AdminAppealsPage() {
  const router = useRouter();
  const [appeals, setAppeals] = useState<Appeal[]>([]);
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
    loadAppeals();
  }, [router]);

  async function loadAppeals() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/appeals");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load appeals");
      setAppeals(data.appeals);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDecision(id: string, decision: "approve" | "reject") {
    setActionMessage("");
    try {
      const res = await fetch(`/api/admin/appeals/${id}/${decision}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Could not ${decision}`);

      setActionMessage(`Appeal ${decision}d.`);
      setAppeals((prev) => prev.filter((a) => a.id !== id));
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
              <div className="logo-sub">Admin control hub</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="btn" onClick={() => router.push("/admin")}>
              <i className="fas fa-arrow-left"></i> Applications
            </button>
            <button className="btn" onClick={() => router.push("/admin/reports")}>
              <i className="fas fa-exclamation-triangle"></i> Reports
            </button>
            <ProfileMenu />
          </div>
        </div>

        <div style={{ marginTop: "1.5rem" }}>
          <h2>
            <i className="fas fa-undo" style={{ color: "#2a7de1" }}></i> Scribe reinstatement appeals
          </h2>
          <p style={{ color: "#5e7188", fontSize: "0.9rem", marginTop: "0.4rem" }}>
            These are from users previously demoted from Scribe, asking to be reinstated. Approving flips them
            back to Scribe and sends them a welcome-back message; rejecting starts their 30-day cooldown before
            they can appeal again.
          </p>

          {loading && <p style={{ marginTop: "1rem", color: "#5e7188" }}>Loading...</p>}
          {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}
          {actionMessage && <p style={{ marginTop: "1rem", color: "#1b7e4a" }}>{actionMessage}</p>}
          {!loading && !error && appeals.length === 0 && (
            <p style={{ marginTop: "1rem", color: "#5e7188" }}>No pending appeals right now.</p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", marginTop: "1rem" }}>
            {appeals.map((a) => (
              <div
                key={a.id}
                style={{
                  background: "white",
                  border: "1px solid #e1e8f0",
                  borderRadius: "1rem",
                  padding: "1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: "0.6rem",
                }}
              >
                <div style={{ flex: "1 1 260px" }}>
                  <strong>{a.user.fullName}</strong>
                  <div style={{ fontSize: "0.85rem", color: "#5e7188" }}>
                    {a.user.email}
                    {a.user.level ? ` · ${a.user.level}` : ""}
                    {a.user.demotedAt && ` · Demoted ${new Date(a.user.demotedAt).toLocaleDateString()}`}
                  </div>
                  <p style={{ fontSize: "0.85rem", color: "#3b4c62", marginTop: "0.5rem", whiteSpace: "pre-wrap" }}>
                    &ldquo;{a.reason}&rdquo;
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.6rem" }}>
                  <button
                    className="btn"
                    style={{ background: "#1b7e4a", borderColor: "#1b7e4a", color: "white" }}
                    onClick={() => handleDecision(a.id, "approve")}
                  >
                    <i className="fas fa-check"></i> Reinstate
                  </button>
                  <button
                    className="btn"
                    style={{ background: "#b13e3e", borderColor: "#b13e3e", color: "white" }}
                    onClick={() => handleDecision(a.id, "reject")}
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

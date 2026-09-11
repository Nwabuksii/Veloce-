"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import ProfileMenu from "@/app/components/ProfileMenu";
import { SkeletonList } from "@/app/components/Skeleton";
import Logo from "@/app/components/Logo";
import { friendlyErrorMessage } from "@/lib/api-client";

interface ScribeView {
  id: string;
  fullName: string;
  email: string;
  uploadCount: number;
}

export default function ManageScribesPage() {
  const router = useRouter();
  const [scribes, setScribes] = useState<ScribeView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [demoteReason, setDemoteReason] = useState("");
  const [promotingId, setPromotingId] = useState<string | null>(null);

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
      const res = await fetch("/api/admin/scribes");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load scribes");
      setScribes(data.scribes);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDemote(id: string) {
    setActionMessage("");
    try {
      const res = await fetch(`/api/admin/scribes/${id}/demote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: demoteReason.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not demote this scribe");

      setActionMessage(`${data.user.fullName} has been demoted to Student — takes effect on their next login.`);
      setScribes((prev) => prev.filter((s) => s.id !== id));
      setConfirmingId(null);
      setDemoteReason("");
    } catch (err) {
      setActionMessage(friendlyErrorMessage(err));
    }
  }

  async function handlePromote(id: string, fullName: string) {
    setActionMessage("");
    setPromotingId(id);
    try {
      const res = await fetch(`/api/admin/promote/${id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not promote this user");

      setActionMessage(`${fullName} is now an Admin.`);
      setScribes((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setActionMessage(friendlyErrorMessage(err));
    } finally {
      setPromotingId(null);
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
              <div className="logo-sub">Manage scribes</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="btn" onClick={() => router.push("/admin")}>
              <i className="fas fa-arrow-left"></i> Applications
            </button>
            <button className="btn" onClick={() => router.push("/admin/appeals")}>
              <i className="fas fa-undo"></i> Appeals
            </button>
            <button className="btn" onClick={() => router.push("/admin/reports")}>
              <i className="fas fa-exclamation-triangle"></i> Reports
            </button>
            <ProfileMenu />
          </div>
        </div>

        <p style={{ color: "var(--text-secondary)", marginTop: "1rem", fontSize: "0.9rem" }}>
          Demoting a scribe reverts them to Student on their next login and lets them submit one reinstatement
          appeal a month. Their existing uploads, sales, and reviews stay visible on their profile, just marked
          as no longer active. Promoting a scribe makes them a full Admin for your university.
        </p>

        {loading && <SkeletonList rows={3} />}
        {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}
        {actionMessage && <p style={{ color: "var(--text-success)", marginTop: "1rem" }}>{actionMessage}</p>}
        {!loading && !error && scribes.length === 0 && (
          <p style={{ color: "var(--text-secondary)", marginTop: "1rem" }}>No active scribes right now.</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", marginTop: "1rem" }}>
          {scribes.map((s) => (
            <div
              key={s.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border-blue)",
                borderRadius: "1rem",
                padding: "1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: confirmingId === s.id ? "flex-start" : "center",
                flexWrap: "wrap",
                gap: "0.6rem",
              }}
            >
              <div>
                <button
                  onClick={() => router.push(`/scribe/${s.id}`)}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 600, color: "var(--text-primary)" }}
                >
                  {s.fullName}
                </button>
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  {s.email} · {s.uploadCount} upload{s.uploadCount === 1 ? "" : "s"}
                </div>
              </div>

              {confirmingId === s.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%", maxWidth: 360 }}>
                  <textarea
                    value={demoteReason}
                    onChange={(e) => setDemoteReason(e.target.value)}
                    rows={2}
                    placeholder="Reason (optional) — shared with the scribe"
                    style={{ padding: "0.5rem", borderRadius: "0.6rem", border: "1px solid var(--border-blue)", fontFamily: "inherit", fontSize: "0.85rem" }}
                  />
                  <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-danger)" }}>Demote for real?</span>
                    <button
                      className="btn"
                      style={{ background: "var(--text-danger)", borderColor: "var(--text-danger)", color: "white" }}
                      onClick={() => handleDemote(s.id)}
                    >
                      Yes, demote
                    </button>
                    <button
                      className="btn"
                      onClick={() => {
                        setConfirmingId(null);
                        setDemoteReason("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "0.6rem" }}>
                  <button
                    className="btn"
                    onClick={() => handlePromote(s.id, s.fullName)}
                    disabled={promotingId === s.id}
                  >
                    <i className="fas fa-user-shield"></i> {promotingId === s.id ? "Promoting..." : "Promote to Admin"}
                  </button>
                  <button className="btn" onClick={() => setConfirmingId(s.id)}>
                    <i className="fas fa-user-minus"></i> Demote
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

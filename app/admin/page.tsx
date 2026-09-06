"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import ProfileMenu from "@/app/components/ProfileMenu";
import Logo from "@/app/components/Logo";
import { friendlyErrorMessage } from "@/lib/api-client";

interface Application {
  id: string;
  reason: string;
  status: string;
  submittedAt: string;
  user: { id: string; fullName: string; email: string; level?: string };
}

export default function AdminPage() {
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
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

    loadApplications();
  }, [router]);

  async function loadApplications() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/scribe-applications");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load applications");
      setApplications(data.applications);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDecision(id: string, decision: "approve" | "reject") {
    setActionMessage("");

    try {
      const res = await fetch(`/api/admin/scribe-applications/${id}/${decision}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Could not ${decision}`);

      setActionMessage(`Application ${decision}d.`);
      setApplications((prev) => prev.filter((a) => a.id !== id));
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
            <button className="btn" onClick={() => router.push("/admin/appeals")}>
              <i className="fas fa-undo"></i> Appeals
            </button>
            <button className="btn" onClick={() => router.push("/admin/reports")}>
              <i className="fas fa-exclamation-triangle"></i> Reports
            </button>
            <button className="btn" onClick={() => router.push("/admin/payouts")}>
              <i className="fas fa-money-bill-wave"></i> Payouts
            </button>
            <ProfileMenu />
          </div>
        </div>

        <div style={{ marginTop: "1.5rem" }}>
          <h2>
            <i className="fas fa-user-cog" style={{ color: "#2a7de1" }}></i> Scribe application review queue
          </h2>

          {loading && <p style={{ marginTop: "1rem", color: "#5e7188" }}>Loading...</p>}
          {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}
          {actionMessage && <p style={{ marginTop: "1rem", color: "#1b7e4a" }}>{actionMessage}</p>}
          {!loading && !error && applications.length === 0 && (
            <p style={{ marginTop: "1rem", color: "#5e7188" }}>No pending applications right now.</p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", marginTop: "1rem" }}>
            {applications.map((app) => (
              <div
                key={app.id}
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
                  <strong>{app.user.fullName}</strong>
                  <div style={{ fontSize: "0.85rem", color: "#5e7188" }}>
                    {app.user.email}
                    {app.user.level ? ` · ${app.user.level}` : ""}
                  </div>
                  <p style={{ fontSize: "0.85rem", color: "#3b4c62", marginTop: "0.5rem", whiteSpace: "pre-wrap" }}>
                    &ldquo;{app.reason}&rdquo;
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.6rem" }}>
                  <button
                    className="btn"
                    style={{ background: "#1b7e4a", borderColor: "#1b7e4a", color: "white" }}
                    onClick={() => handleDecision(app.id, "approve")}
                  >
                    <i className="fas fa-check"></i> Approve
                  </button>
                  <button
                    className="btn"
                    style={{ background: "#b13e3e", borderColor: "#b13e3e", color: "white" }}
                    onClick={() => handleDecision(app.id, "reject")}
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

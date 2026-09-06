"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";

interface ReportItem {
  id: string;
  type: "BLOCK" | "USER";
  reason: string;
  createdAt: string;
  reporter: { id: string; fullName: string; email: string };
  block: { id: string; title: string; course: { code: string; name: string } } | null;
  reportedUser: { id: string; fullName: string; email: string; role: string } | null;
}

export default function AdminReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportItem[]>([]);
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

  function load() {
    setLoading(true);
    apiFetch("/api/admin/reports")
      .then((data) => setReports(data.reports))
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  async function handleResolve(id: string, action: "dismiss" | "action") {
    setActionMessage("");
    try {
      await apiFetch(`/api/admin/reports/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setActionMessage(action === "dismiss" ? "Report dismissed." : "Report marked as actioned.");
      setReports((prev) => prev.filter((r) => r.id !== id));
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
            <button className="btn" onClick={() => router.push("/admin/appeals")}>
              <i className="fas fa-undo"></i> Appeals
            </button>
            <ProfileMenu />
          </div>
        </div>

        <div style={{ marginTop: "1.5rem" }}>
          <h2>
            <i className="fas fa-flag" style={{ color: "#2a7de1" }}></i> Reports
          </h2>
          <p style={{ color: "#5e7188", fontSize: "0.9rem", marginTop: "0.4rem" }}>
            Blocks and users flagged by students. Resolving a report doesn't automatically remove content or
            demote anyone — use the Moderation queue or Manage Scribes page to actually act on it, then mark
            the report accordingly here.
          </p>

          {loading && <p style={{ marginTop: "1rem", color: "#5e7188" }}>Loading...</p>}
          {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}
          {actionMessage && <p style={{ marginTop: "1rem", color: "#1b7e4a" }}>{actionMessage}</p>}
          {!loading && !error && reports.length === 0 && (
            <p style={{ marginTop: "1rem", color: "#5e7188" }}>No pending reports right now.</p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", marginTop: "1rem" }}>
            {reports.map((r) => (
              <div
                key={r.id}
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
                <div style={{ flex: "1 1 300px" }}>
                  <span
                    style={{
                      background: r.type === "BLOCK" ? "#eef3fa" : "#fdecec",
                      color: r.type === "BLOCK" ? "#2a7de1" : "#b13e3e",
                      padding: "0.15rem 0.7rem",
                      borderRadius: "30px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                    }}
                  >
                    {r.type === "BLOCK" ? "Block report" : "User report"}
                  </span>

                  <div style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
                    {r.type === "BLOCK" && r.block && (
                      <>
                        <strong>{r.block.title}</strong> ({r.block.course.code} · {r.block.course.name})
                      </>
                    )}
                    {r.type === "USER" && r.reportedUser && (
                      <>
                        <strong>{r.reportedUser.fullName}</strong> ({r.reportedUser.email} · {r.reportedUser.role})
                      </>
                    )}
                  </div>

                  <div style={{ fontSize: "0.8rem", color: "#5e7188", marginTop: "0.3rem" }}>
                    Reported by {r.reporter.fullName} on {new Date(r.createdAt).toLocaleDateString()}
                  </div>

                  <p style={{ fontSize: "0.85rem", color: "#3b4c62", marginTop: "0.6rem", whiteSpace: "pre-wrap" }}>
                    &ldquo;{r.reason}&rdquo;
                  </p>
                </div>

                <div style={{ display: "flex", gap: "0.6rem" }}>
                  <button
                    className="btn"
                    style={{ background: "#b13e3e", borderColor: "#b13e3e", color: "white" }}
                    onClick={() => handleResolve(r.id, "action")}
                  >
                    <i className="fas fa-gavel"></i> Mark actioned
                  </button>
                  <button className="btn" onClick={() => handleResolve(r.id, "dismiss")}>
                    <i className="fas fa-times"></i> Dismiss
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

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { SkeletonList } from "@/app/components/Skeleton";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";

interface ReportItem {
  id: string;
  type: "BLOCK" | "USER";
  reason: string;
  createdAt: string;
  reporter: { id: string; fullName: string; email: string };
  block: { id: string; title: string; course: { code: string; name: string } } | null;
  reportedUser: { id: string; fullName: string; email: string; role: string } | null;
  note: { id: string; scribe: { id: string; fullName: string } } | null;
}

export default function AdminReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [removingNoteId, setRemovingNoteId] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [removeSubmitting, setRemoveSubmitting] = useState(false);

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

  async function handleRemoveVersion(noteId: string) {
    if (removeReason.trim().length < 10) {
      toast.error("Give the scribe at least a short reason (10+ characters).");
      return;
    }

    setRemoveSubmitting(true);
    try {
      const data = await apiFetch(`/api/admin/notes/${noteId}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: removeReason.trim() }),
      });
      toast.success(
        `Version removed. ${data.reportsResolved} report${data.reportsResolved === 1 ? "" : "s"} resolved and ${data.reportersNotified} reporter${data.reportersNotified === 1 ? "" : "s"} notified.`
      );
      setReports((prev) => prev.filter((r) => r.note?.id !== noteId));
      setRemovingNoteId(null);
      setRemoveReason("");
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setRemoveSubmitting(false);
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
            <i className="fas fa-flag" style={{ color: "var(--text-info)" }}></i> Reports
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "0.4rem" }}>
            Blocks and users flagged by students. When a report is tied to a specific version, you can remove
            that version directly from here — it comes off sale immediately, counts against the scribe's trust
            level, and both the scribe and reporter(s) are notified automatically. For anything else, use the
            Moderation queue or Manage Scribes page, then mark the report accordingly here.
          </p>

          {loading && <SkeletonList rows={3} />}
          {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}
          {actionMessage && <p style={{ marginTop: "1rem", color: "var(--text-success)" }}>{actionMessage}</p>}
          {!loading && !error && reports.length === 0 && (
            <p style={{ marginTop: "1rem", color: "var(--text-secondary)" }}>No pending reports right now.</p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", marginTop: "1rem" }}>
            {reports.map((r) => (
              <div
                key={r.id}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border-blue)",
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
                      background: r.type === "BLOCK" ? "var(--bg-info)" : "var(--bg-danger)",
                      color: r.type === "BLOCK" ? "var(--text-info)" : "var(--text-danger)",
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

                  {r.note && (
                    <div style={{ fontSize: "0.82rem", color: "var(--text-info)", marginTop: "0.2rem" }}>
                      <i className="fas fa-user-pen"></i> Reported version: {r.note.scribe.fullName}
                    </div>
                  )}
                  {r.note ? (
                    <div>
                      <button
                        onClick={() => window.open(`/notes/${r.note!.id}/read`, "_blank")}
                        style={{ background: "none", border: "none", padding: 0, marginTop: "0.3rem", cursor: "pointer", fontSize: "0.8rem", color: "var(--text-secondary)", textDecoration: "underline" }}
                      >
                        <i className="fas fa-book-open"></i> View reported version &rarr;
                      </button>
                    </div>
                  ) : (
                    r.block && (
                      <div>
                        <button
                          onClick={() => window.open(`/blocks/${r.block!.id}`, "_blank")}
                          style={{ background: "none", border: "none", padding: 0, marginTop: "0.3rem", cursor: "pointer", fontSize: "0.8rem", color: "var(--text-secondary)", textDecoration: "underline" }}
                        >
                          View block &rarr;
                        </button>
                      </div>
                    )
                  )}

                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.3rem" }}>
                    Reported by {r.reporter.fullName} on {new Date(r.createdAt).toLocaleDateString()}
                  </div>

                  <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.6rem", whiteSpace: "pre-wrap" }}>
                    &ldquo;{r.reason}&rdquo;
                  </p>
                </div>

                <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                  {r.note && (
                    <button
                      className="btn press-on-tap"
                      style={{ background: "var(--text-danger)", borderColor: "var(--text-danger)", color: "white" }}
                      onClick={() => setRemovingNoteId((cur) => (cur === r.note!.id ? null : r.note!.id))}
                    >
                      <i className="fas fa-trash"></i> Remove this version
                    </button>
                  )}
                  <button
                    className="btn"
                    style={{ background: "var(--text-danger)", borderColor: "var(--text-danger)", color: "white" }}
                    onClick={() => handleResolve(r.id, "action")}
                  >
                    <i className="fas fa-gavel"></i> Mark actioned
                  </button>
                  <button className="btn" onClick={() => handleResolve(r.id, "dismiss")}>
                    <i className="fas fa-times"></i> Dismiss
                  </button>
                </div>

                {r.note && removingNoteId === r.note.id && (
                  <div
                    style={{
                      flexBasis: "100%",
                      borderTop: "1px solid var(--border-blue)",
                      marginTop: "0.6rem",
                      paddingTop: "0.8rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.6rem",
                    }}
                  >
                    <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Why is {r.note.scribe.fullName}&apos;s version being removed? This is sent to them directly, and
                      counts against their trust level.
                    </label>
                    <textarea
                      value={removeReason}
                      onChange={(e) => setRemoveReason(e.target.value)}
                      rows={2}
                      placeholder="e.g. Contains pages from a different course entirely..."
                      style={{
                        padding: "0.5rem",
                        borderRadius: "0.6rem",
                        border: "1px solid var(--border-blue)",
                        fontFamily: "inherit",
                        fontSize: "0.85rem",
                        background: "var(--surface)",
                        color: "var(--text-primary)",
                      }}
                    />
                    <div style={{ display: "flex", gap: "0.6rem" }}>
                      <button
                        className="btn btn-primary press-on-tap"
                        disabled={removeSubmitting}
                        onClick={() => handleRemoveVersion(r.note!.id)}
                      >
                        {removeSubmitting ? "Removing..." : "Confirm removal"}
                      </button>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          setRemovingNoteId(null);
                          setRemoveReason("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

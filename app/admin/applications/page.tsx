"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
import Avatar from "@/app/components/Avatar";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { SkeletonList } from "@/app/components/Skeleton";
import { friendlyErrorMessage } from "@/lib/api-client";
import { LEVELS } from "@/lib/academic";

interface Application {
  id: string;
  reason: string;
  status: string;
  submittedAt: string;
  user: { id: string; fullName: string; email: string; level: string | null; department: string | null };
  score: number;
  scoreLabel: "strong" | "review" | "weak";
  breakdown: { label: string; points: number }[];
}

const LABEL_TEXT = { strong: "Strong", review: "Needs a closer look", weak: "Weak" } as const;
const LABEL_CLASS = { strong: "success", review: "warn", weak: "danger" } as const;
const signed = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

export default function AdminApplicationsPage() {
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const [course, setCourse] = useState("");
  const [level, setLevel] = useState("");
  const [sort, setSort] = useState<"high" | "low">("high");

  const [bulkAction, setBulkAction] = useState<"approve" | "reject">("approve");
  const [threshold, setThreshold] = useState("70");
  const [bulkMessage, setBulkMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const courses = useMemo(
    () => Array.from(new Set(applications.map((a) => a.user.department).filter((d): d is string => !!d))).sort(),
    [applications]
  );

  const visible = useMemo(() => {
    const list = applications.filter((a) => (!course || a.user.department === course) && (!level || a.user.level === level));
    return list.sort((a, b) => (sort === "high" ? b.score - a.score : a.score - b.score));
  }, [applications, course, level, sort]);

  const pct = Number(threshold);
  const pctValid = threshold.trim() !== "" && Number.isFinite(pct) && pct >= 0 && pct <= 100;
  const matching = pctValid ? visible.filter((a) => (bulkAction === "approve" ? a.score >= pct : a.score <= pct)) : [];
  const canRun = matching.length > 0 && (bulkAction === "approve" || bulkMessage.trim() !== "");

  function chooseAction(action: "approve" | "reject") {
    setBulkAction(action);
    setThreshold(action === "approve" ? "70" : "10");
  }

  async function runBulk() {
    setBusy(true);
    setActionMessage("");
    try {
      const res = await fetch("/api/admin/scribe-applications/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: bulkAction, threshold: pct, ids: matching.map((a) => a.id), message: bulkMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not complete the batch");
      setActionMessage(`${data.processed} ${bulkAction === "approve" ? "approved" : "rejected"}${data.skipped ? `, ${data.skipped} skipped (already decided)` : ""}.`);
      setConfirming(false);
      setBulkMessage("");
      await loadApplications();
    } catch (err) {
      setActionMessage(friendlyErrorMessage(err));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-wrap">
      <AdminPageHeader section="People" title="Scribe" serif="applications" subtitle="Review and decide on pending applications. The percentage is a guide only — you make the call. Approving sends a welcome message automatically.">
        <button className="btn btn-ghost" onClick={() => router.push("/admin")}>
          {AIcon.back()} Admin
        </button>
      </AdminPageHeader>

      {loading && <SkeletonList rows={3} />}
      {error && <div className="auth-error">{error}</div>}
      {actionMessage && <div className="notice">{actionMessage}</div>}

      {!loading && !error && applications.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">{AIcon.check()}</div>
          <h3 className="empty-title">No pending applications</h3>
          <p className="empty-desc">Nobody is waiting to become a scribe right now.</p>
        </div>
      )}

      {applications.length > 0 && (
        <>
          <div className="inline-row" style={{ flexWrap: "wrap", marginBottom: 16 }}>
            <select className="select" style={{ flex: "1 1 180px" }} value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Filter by course">
              <option value="">All courses</option>
              {courses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select className="select" style={{ flex: "1 1 120px" }} value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Filter by level">
              <option value="">All levels</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <select className="select" style={{ flex: "1 1 180px" }} value={sort} onChange={(e) => setSort(e.target.value as "high" | "low")} aria-label="Sort by percentage">
              <option value="high">Highest % first</option>
              <option value="low">Lowest % first</option>
            </select>
          </div>

          <div className="person-card" style={{ flexDirection: "column", alignItems: "stretch", gap: 10, marginBottom: 16 }}>
            <strong>Batch decision</strong>
            <div className="inline-row" style={{ flexWrap: "wrap" }}>
              <select className="select" style={{ flex: "1 1 200px" }} value={bulkAction} onChange={(e) => chooseAction(e.target.value as "approve" | "reject")} aria-label="Batch action">
                <option value="approve">Approve from this % upwards</option>
                <option value="reject">Reject from this % downwards</option>
              </select>
              <input className="input" style={{ flex: "0 1 110px" }} type="number" min={0} max={100} value={threshold} onChange={(e) => setThreshold(e.target.value)} aria-label="Percentage" />
            </div>
            {bulkAction === "reject" && (
              <textarea className="textarea" rows={3} maxLength={1000} value={bulkMessage} onChange={(e) => setBulkMessage(e.target.value)} placeholder="Message to every rejected applicant (required)" />
            )}
            <div className="inline-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <span>
                {matching.length} of {visible.length} shown {bulkAction === "approve" ? `at ${pctValid ? pct : "…"}% or more` : `at ${pctValid ? pct : "…"}% or less`}
              </span>
              <button className={`btn btn-sm ${bulkAction === "approve" ? "btn-success" : "btn-danger"}`} disabled={!canRun} onClick={() => setConfirming(true)}>
                {bulkAction === "approve" ? "Approve" : "Reject"} {matching.length}
              </button>
            </div>
          </div>
        </>
      )}

      {applications.length > 0 && visible.length === 0 && <p className="empty-desc">No applications match these filters.</p>}

      <div className="stack-10">
        {visible.map((app) => (
          <div key={app.id} className="person-card" style={{ alignItems: "flex-start" }}>
            <Avatar name={app.user.fullName} />
            <div className="person-info">
              <div className="person-name-row">
                <span className="person-name">{app.user.fullName}</span>
                <span className={`status ${LABEL_CLASS[app.scoreLabel]}`}>
                  {app.score}% · {LABEL_TEXT[app.scoreLabel]}
                </span>
              </div>
              <div className="person-stats">
                <span>
                  {AIcon.mail()} {app.user.email}
                </span>
                {app.user.level && (
                  <span>
                    {AIcon.book()} <strong>{app.user.level}</strong>
                  </span>
                )}
                {app.user.department && <span>{app.user.department}</span>}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", margin: "6px 0" }}>
                {app.breakdown.map((l) => `${l.label} ${signed(l.points)}`).join(" · ")}
              </div>
              <p className="person-note">&ldquo;{app.reason}&rdquo;</p>
            </div>
            <div className="request-actions">
              <button className="btn btn-sm btn-danger" onClick={() => handleDecision(app.id, "reject")}>
                Reject
              </button>
              <button className="btn btn-sm btn-success" onClick={() => handleDecision(app.id, "approve")}>
                {AIcon.check()} Approve
              </button>
            </div>
          </div>
        ))}
      </div>

      {confirming && (
        <ConfirmDialog
          title={`${bulkAction === "approve" ? "Approve" : "Reject"} ${matching.length} applicant${matching.length === 1 ? "" : "s"}?`}
          confirmLabel={bulkAction === "approve" ? "Approve all" : "Reject all"}
          danger={bulkAction === "reject"}
          busy={busy}
          onConfirm={runBulk}
          onCancel={() => setConfirming(false)}
        >
          {bulkAction === "approve"
            ? `Everyone shown at ${pct}% or more becomes a scribe and gets the welcome message.`
            : `Everyone shown at ${pct}% or less is rejected and receives your message. They can re-apply after the cooldown.`}
        </ConfirmDialog>
      )}
    </div>
  );
}

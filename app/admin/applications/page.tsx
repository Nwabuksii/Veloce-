"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
import Avatar from "@/app/components/Avatar";
import { SkeletonList } from "@/app/components/Skeleton";
import { friendlyErrorMessage } from "@/lib/api-client";

interface Application {
  id: string;
  reason: string;
  status: string;
  submittedAt: string;
  user: { id: string; fullName: string; email: string; level?: string };
}

export default function AdminApplicationsPage() {
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
      <AdminPageHeader section="People" title="Scribe" serif="applications" subtitle="Review and decide on pending applications. Approving sends a welcome message automatically.">
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

      <div className="stack-10">
        {applications.map((app) => (
          <div key={app.id} className="person-card" style={{ alignItems: "flex-start" }}>
            <Avatar name={app.user.fullName} />
            <div className="person-info">
              <div className="person-name-row">
                <span className="person-name">{app.user.fullName}</span>
                <span className="status plum">Pending</span>
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
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
import Avatar from "@/app/components/Avatar";
import { SkeletonList } from "@/app/components/Skeleton";
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
      <AdminPageHeader
        section="People"
        title="Reinstatement"
        serif="appeals"
        subtitle="From scribes previously demoted, asking to be reinstated. Approving flips them back to Scribe and sends a welcome-back message; rejecting starts their 30-day cooldown before they can appeal again."
      >
        <button className="btn btn-ghost" onClick={() => router.push("/admin/reports")}>
          {AIcon.flag()} Reports
        </button>
        <button className="btn btn-ghost" onClick={() => router.push("/admin")}>
          {AIcon.back()} Admin
        </button>
      </AdminPageHeader>

      {loading && <SkeletonList rows={3} />}
      {error && <div className="auth-error">{error}</div>}
      {actionMessage && <div className="notice">{actionMessage}</div>}

      {!loading && !error && appeals.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">{AIcon.check()}</div>
          <h3 className="empty-title">No pending appeals</h3>
          <p className="empty-desc">No demoted scribes are waiting on a decision.</p>
        </div>
      )}

      <div className="stack-10">
        {appeals.map((a) => (
          <div key={a.id} className="person-card" style={{ alignItems: "flex-start" }}>
            <Avatar name={a.user.fullName} />
            <div className="person-info">
              <div className="person-name-row">
                <span className="person-name">{a.user.fullName}</span>
                <span className="status warn">Appeal</span>
              </div>
              <div className="person-stats">
                <span>
                  {AIcon.mail()} {a.user.email}
                </span>
                {a.user.level && (
                  <span>
                    {AIcon.book()} <strong>{a.user.level}</strong>
                  </span>
                )}
                {a.user.demotedAt && (
                  <span>
                    {AIcon.clock()} Demoted {new Date(a.user.demotedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <p className="person-note">&ldquo;{a.reason}&rdquo;</p>
            </div>
            <div className="request-actions">
              <button className="btn btn-sm btn-danger" onClick={() => handleDecision(a.id, "reject")}>
                Reject
              </button>
              <button className="btn btn-sm btn-success" onClick={() => handleDecision(a.id, "approve")}>
                {AIcon.check()} Reinstate
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

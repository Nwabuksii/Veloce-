"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
import Avatar from "@/app/components/Avatar";
import { SkeletonList } from "@/app/components/Skeleton";
import { friendlyErrorMessage } from "@/lib/api-client";

interface ScribeView {
  id: string;
  fullName: string;
  email: string;
  uploadCount: number;
  avatarUrl: string | null;
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
      <AdminPageHeader
        section="Trust"
        title="Manage"
        serif="scribes"
        subtitle="Trust levels, suspensions and reinstatements. Demoting reverts them to Student on next login and opens an appeal window."
      >
        <button className="btn btn-ghost" onClick={() => router.push("/admin/appeals")}>
          {AIcon.warn()} Appeals
        </button>
        <button className="btn btn-ghost" onClick={() => router.push("/admin/reports")}>
          {AIcon.flag()} Reports
        </button>
        <button className="btn btn-ghost" onClick={() => router.push("/admin")}>
          {AIcon.back()} Admin
        </button>
      </AdminPageHeader>

      <p className="panel-desc">
        Demoting a scribe reverts them to Student on their next login and lets them submit one reinstatement
        appeal a month. Their existing uploads, sales, and reviews stay visible on their profile, just marked
        as no longer active. Promoting a scribe makes them a full Admin for your university.
      </p>

      {loading && <SkeletonList rows={3} />}
      {error && <div className="auth-error">{error}</div>}
      {actionMessage && <div className="notice">{actionMessage}</div>}
      {!loading && !error && scribes.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">{AIcon.user()}</div>
          <h3 className="empty-title">No active scribes</h3>
          <p className="empty-desc">There are no active scribes right now.</p>
        </div>
      )}

      <div className="stack-10">
        {scribes.map((s) => (
          <div key={s.id} className="person-card">
            <Avatar name={s.fullName} imageUrl={s.avatarUrl} size="sm" />
            <div className="person-info">
              <div className="person-name-row">
                <button className="person-link person-name" onClick={() => router.push(`/scribe/${s.id}`)}>
                  {s.fullName}
                </button>
              </div>
              <div className="person-stats">
                <span>{AIcon.mail()} {s.email}</span>
                <span>{AIcon.book()} <strong>{s.uploadCount}</strong> upload{s.uploadCount === 1 ? "" : "s"}</span>
              </div>
            </div>

            {confirmingId === s.id ? (
              <div className="request-extra">
                <textarea
                  className="textarea"
                  value={demoteReason}
                  onChange={(e) => setDemoteReason(e.target.value)}
                  rows={2}
                  placeholder="Reason (optional) — shared with the scribe"
                />
                <div className="form-actions">
                  <span className="person-sub text-danger" style={{ alignSelf: "center" }}>Demote for real?</span>
                  <button className="btn btn-danger" onClick={() => handleDemote(s.id)}>
                    Yes, demote
                  </button>
                  <button
                    className="btn btn-ghost"
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
              <div className="request-actions">
                <button className="btn btn-ghost" onClick={() => handlePromote(s.id, s.fullName)} disabled={promotingId === s.id}>
                  {AIcon.shield()} {promotingId === s.id ? "Promoting..." : "Promote to Admin"}
                </button>
                <button className="btn btn-danger" onClick={() => setConfirmingId(s.id)}>
                  Demote
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

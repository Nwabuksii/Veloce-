"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
import { SkeletonList } from "@/app/components/Skeleton";
import { friendlyErrorMessage } from "@/lib/api-client";

interface FlaggedNote {
  id: string;
  similarityScore: number | null;
  qualityScore: number | null;
  flagReason: string | null;
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

  const pct = (v: number | null) => (v != null ? `${Math.round(v * 100)}%` : "—");

  return (
    <div className="page-wrap">
      <AdminPageHeader section="Quality" title="Content" serif="moderation" subtitle="Notes waiting on review before they go live in the catalogue.">
        <button className="btn btn-ghost" onClick={() => router.push("/admin")}>
          {AIcon.back()} Admin
        </button>
      </AdminPageHeader>

      {loading && <SkeletonList rows={3} />}
      {error && <div className="auth-error">{error}</div>}
      {actionMessage && <p style={{ color: "var(--text-success)", marginBottom: "0.8rem", fontSize: "0.85rem" }}>{actionMessage}</p>}

      {!loading && !error && notes.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">{AIcon.check()}</div>
          <h3 className="empty-title">Queue is clear</h3>
          <p className="empty-desc">Nothing flagged right now. Nice work.</p>
        </div>
      )}

      <div className="stack-10">
        {notes.map((n) => (
          <div key={n.id} className="request-item">
            <div className="request-body">
              <div className="request-code">{n.block.course.code}</div>
              <div className="request-topic">{n.block.title}</div>
              <div className="request-meta">
                <span>
                  {AIcon.user()} {n.scribe.fullName} ({n.scribe.email})
                </span>
                <span>Similarity {pct(n.similarityScore)}</span>
                <span>Quality {pct(n.qualityScore)}</span>
                {n.flagReason && (
                  <span className="is-warn">
                    {AIcon.warn()} {n.flagReason}
                  </span>
                )}
              </div>
            </div>
            <div className="request-actions">
              <button className="btn btn-sm btn-ghost" onClick={() => router.push(`/notes/${n.id}/read`)}>
                {AIcon.eye()} Preview
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => handleDecision(n.id, "reject")}>
                Reject
              </button>
              <button className="btn btn-sm btn-success" onClick={() => handleDecision(n.id, "approve")}>
                Approve
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
import { SkeletonList } from "@/app/components/Skeleton";
import { friendlyErrorMessage } from "@/lib/api-client";
import { formatDateDDMMYYYY } from "@/lib/date-format";
import { GROUP_HELP, GROUP_ORDER, GROUP_TITLES, type FlagCode } from "@/lib/flag-reasons";

interface QueueMatch {
  noteId: string;
  similarity: number;
  exact: boolean;
  status: string;
  courseCode: string;
  title: string;
  scribeName: string;
  sameScribe: boolean;
  uploadedAt: string;
}

interface FlaggedNote {
  id: string;
  createdAt: string;
  similarityScore: number | null;
  qualityScore: number | null;
  pageCount: number | null;
  flagReason: string | null;
  block: { title: string; course: { code: string } };
  scribe: { fullName: string; email: string; live: number; rejected: number; total: number };
  group: FlagCode;
  reasons: Array<{ code: FlagCode; label: string }>;
  matches: QueueMatch[];
}

const statusClass = (s: string) => (s === "LIVE" ? "live" : s === "REJECTED" ? "rejected" : "review");
const statusLabel = (s: string) => (s === "LIVE" ? "Live" : s === "REJECTED" ? "Rejected" : s === "FLAGGED" ? "In this queue" : s.charAt(0) + s.slice(1).toLowerCase());

export default function ModerationPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<FlaggedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [filter, setFilter] = useState<FlagCode | "ALL">("ALL");

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

  // Each note sits under the most serious reason it has; the group chips
  // at the top filter the list.
  const groups = useMemo(() => {
    const map = new Map<FlagCode, FlaggedNote[]>();
    for (const n of notes) map.set(n.group, [...(map.get(n.group) ?? []), n]);
    return GROUP_ORDER.filter((code) => map.has(code)).map((code) => ({ code, items: map.get(code)! }));
  }, [notes]);

  const visibleGroups = filter === "ALL" ? groups : groups.filter((g) => g.code === filter);

  return (
    <div className="page-wrap">
      <AdminPageHeader section="Quality" title="Content" serif="moderation" subtitle="Notes waiting on review before they go live, grouped by why they were held.">
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

      {groups.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <button className={`btn btn-sm ${filter === "ALL" ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter("ALL")}>
            All ({notes.length})
          </button>
          {groups.map((g) => (
            <button key={g.code} className={`btn btn-sm ${filter === g.code ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter(g.code)}>
              {GROUP_TITLES[g.code]} ({g.items.length})
            </button>
          ))}
        </div>
      )}

      {visibleGroups.map((g) => (
        <section key={g.code} style={{ marginBottom: 28 }}>
          <h3 style={{ marginBottom: 2 }}>
            {GROUP_TITLES[g.code]} <span className="panel-desc" style={{ display: "inline" }}>({g.items.length})</span>
          </h3>
          <p className="panel-desc" style={{ marginTop: 0, marginBottom: 12 }}>{GROUP_HELP[g.code]}</p>

          <div className="stack-10">
            {g.items.map((n) => (
              <div key={n.id} className="request-item" style={{ flexWrap: "wrap" }}>
                <div className="request-body" style={{ minWidth: 0, flex: "1 1 320px" }}>
                  <div className="request-code">
                    {n.block.course.code} · uploaded {formatDateDDMMYYYY(new Date(n.createdAt))}
                    {n.pageCount ? ` · ${n.pageCount} page${n.pageCount === 1 ? "" : "s"}` : ""}
                  </div>
                  <div className="request-topic">{n.block.title}</div>
                  <div className="request-meta">
                    <span>
                      {AIcon.user()} {n.scribe.fullName} ({n.scribe.email})
                    </span>
                    <span>
                      Scribe history: {n.scribe.total <= 1 ? "this is their first note" : `${n.scribe.total} notes, ${n.scribe.live} live, ${n.scribe.rejected} rejected`}
                    </span>
                    <span>Similarity {pct(n.similarityScore)}</span>
                    <span>Quality {pct(n.qualityScore)}</span>
                  </div>

                  {n.reasons.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                      {n.reasons.map((r, i) => (
                        <span key={i} className="is-warn" style={{ display: "inline-flex", gap: 6, alignItems: "flex-start", fontSize: "0.82rem" }}>
                          {AIcon.warn()} <span>{r.label}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="panel-desc" style={{ marginTop: 8 }}>No reason was recorded for this note.</p>
                  )}

                  {n.matches.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div className="form-label" style={{ marginBottom: 6 }}>
                        Looks like {n.matches.length === 1 ? "this note" : `these ${n.matches.length} notes`}
                      </div>
                      <div className="stack-10">
                        {n.matches.map((m) => (
                          <div key={m.noteId} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px" }}>
                            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                                {m.courseCode} — {m.title}
                              </div>
                              <div className="panel-desc" style={{ margin: 0 }}>
                                {m.sameScribe ? "Same scribe" : m.scribeName} · {formatDateDDMMYYYY(new Date(m.uploadedAt))}
                              </div>
                            </div>
                            <span className="status warn">{m.exact ? "Identical" : `${Math.round(m.similarity * 100)}% similar`}</span>
                            <span className={`status ${statusClass(m.status)}`}>{statusLabel(m.status)}</span>
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => router.push(`/admin/moderation/compare?a=${n.id}&b=${m.noteId}`)}
                            >
                              {AIcon.eye()} Compare
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {n.matches.length === 0 && n.reasons.some((r) => r.code === "SIMILAR" || r.code === "EXACT_DUPLICATE") && (
                    <p className="panel-desc" style={{ marginTop: 10 }}>
                      The list of matching notes wasn&apos;t recorded for this older upload, or those notes were deleted.
                    </p>
                  )}
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
        </section>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { SkeletonList } from "@/app/components/Skeleton";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";

interface ReportItem {
  id: string;
  type: "BLOCK" | "USER" | "REFUND";
  reason: string;
  createdAt: string;
  reporter: { id: string; fullName: string; email: string };
  block: { id: string; title: string; course: { code: string; name: string } } | null;
  reportedUser: { id: string; fullName: string; email: string; role: string } | null;
  note: { id: string; scribe: { id: string; fullName: string } } | null;
  purchase: { id: string; purchasedAt: string; amountPaid: number; creditApplied: number; refundedAt: string | null; redeemedWithCoupon: boolean } | null;
}

// Every pending report about the same underlying thing — a note version, a
// bare block, or a user — folded into one card instead of one row each.
// A note version can pick up both BLOCK-type complaints ("this is wrong")
// and REFUND-type ones (a buyer's purchase report), which is why the key is
// note-first: r.note is set on both, so they land in the same group.
interface ReportGroup {
  key: string;
  block: ReportItem["block"];
  note: ReportItem["note"];
  reportedUser: ReportItem["reportedUser"];
  reports: ReportItem[];
}

function groupKey(r: ReportItem): string {
  if (r.note) return `note:${r.note.id}`;
  if (r.block) return `block:${r.block.id}`;
  if (r.reportedUser) return `user:${r.reportedUser.id}`;
  return `report:${r.id}`;
}

type ReplyTarget = { kind: "claim"; reportId: string } | { kind: "group"; key: string };

export default function AdminReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [removingNoteId, setRemovingNoteId] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [removeSubmitting, setRemoveSubmitting] = useState(false);

  const [refunding, setRefunding] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);

  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);

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

  const groups = useMemo<ReportGroup[]>(() => {
    const map = new Map<string, ReportGroup>();
    for (const r of reports) {
      const key = groupKey(r);
      if (!map.has(key)) {
        map.set(key, { key, block: r.block, note: r.note, reportedUser: r.reportedUser, reports: [] });
      }
      map.get(key)!.reports.push(r);
    }
    // Oldest group first, matching the previous flat ordering.
    return Array.from(map.values()).sort(
      (a, b) => new Date(a.reports[0].createdAt).getTime() - new Date(b.reports[0].createdAt).getTime()
    );
  }, [reports]);

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
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
      setRemovingNoteId(null);
      setRemoveReason("");
      load();
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setRemoveSubmitting(false);
    }
  }

  async function handleRefund(purchaseId: string) {
    setRefunding(purchaseId);
    try {
      const data = await apiFetch(`/api/admin/purchases/${purchaseId}/refund`, { method: "POST" });
      toast.success(`Refunded. ₦${data.scribeCutReversed.toLocaleString()} reversed from the scribe, buyer got 1 coupon.`);
      load();
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setRefunding(null);
    }
  }

  // Dismisses every still-pending report in the group in one go. Each one
  // notifies its own reporter (the resolve endpoint does that itself), so a
  // group of 5 identical reports means 5 people each hear back.
  async function handleDismissGroup(group: ReportGroup) {
    setDismissing(group.key);
    try {
      for (const r of group.reports) {
        await apiFetch(`/api/admin/reports/${r.id}/resolve`, { method: "POST" });
      }
      toast.success(group.reports.length > 1 ? `Dismissed and ${group.reports.length} reporters notified.` : "Dismissed and reporter notified.");
      load();
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setDismissing(null);
    }
  }

  function startReply(target: ReplyTarget) {
    setReplyTarget((cur) => {
      if (!cur) return target;
      if (cur.kind === "group" && target.kind === "group" && cur.key === target.key) return null;
      if (cur.kind === "claim" && target.kind === "claim" && cur.reportId === target.reportId) return null;
      return target;
    });
    setReplyText("");
  }

  async function sendReply(recipients: { id: string; fullName: string }[]) {
    if (replyText.trim().length < 2) {
      toast.error("Write a message first.");
      return;
    }
    setReplySending(true);
    try {
      const unique = Array.from(new Map(recipients.map((r) => [r.id, r])).values());
      for (const person of unique) {
        await apiFetch("/api/admin/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audience: "individual",
            recipientId: person.id,
            subject: "Re: your report",
            body: replyText.trim(),
          }),
        });
      }
      toast.success(unique.length > 1 ? `Sent to ${unique.length} reporters.` : "Reply sent.");
      setReplyTarget(null);
      setReplyText("");
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setReplySending(false);
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
                Veloce
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
            Reports about the same block, note version, or user are combined into one card. Every action here —
            refund, remove the version, or dismiss — resolves every pending report in the card and notifies the
            reporter(s) automatically. For anything else, use the Moderation queue or Manage Scribes page.
          </p>

          {loading && <SkeletonList rows={3} />}
          {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}
          {!loading && !error && groups.length === 0 && (
            <p style={{ marginTop: "1rem", color: "var(--text-secondary)" }}>No pending reports right now.</p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", marginTop: "1rem" }}>
            {groups.map((g) => {
              const isUser = !g.note && !g.block && !!g.reportedUser;
              const label = isUser ? "User report" : "Block report";
              const count = g.reports.length;
              const isExpanded = expanded.has(g.key);
              const unrefundedClaims = g.reports.filter((r) => r.type === "REFUND" && r.purchase && !r.purchase.refundedAt);
              const allReporters = g.reports.map((r) => r.reporter);
              const isGroupReplyOpen = replyTarget?.kind === "group" && replyTarget.key === g.key;

              return (
                <div
                  key={g.key}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border-blue)",
                    borderRadius: "12px",
                    padding: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.6rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.6rem" }}>
                    <div style={{ flex: "1 1 300px" }}>
                      <span
                        style={{
                          background: isUser ? "var(--bg-danger)" : "var(--bg-info)",
                          color: isUser ? "var(--text-danger)" : "var(--text-info)",
                          padding: "0.15rem 0.7rem",
                          borderRadius: "10px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                        }}
                      >
                        {label}
                      </span>
                      <span
                        style={{
                          marginLeft: "0.5rem",
                          background: "var(--bg-danger)",
                          color: "var(--text-danger)",
                          padding: "0.15rem 0.6rem",
                          borderRadius: "10px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                        }}
                      >
                        {count === 1 ? "1 report" : `${count} reports`}
                      </span>

                      <div style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
                        {g.block && (
                          <>
                            <strong>{g.block.title}</strong> ({g.block.course.code} · {g.block.course.name})
                          </>
                        )}
                        {isUser && g.reportedUser && (
                          <>
                            <strong>{g.reportedUser.fullName}</strong> ({g.reportedUser.email} · {g.reportedUser.role})
                          </>
                        )}
                      </div>

                      {g.note && (
                        <div style={{ fontSize: "0.82rem", color: "var(--text-info)", marginTop: "0.2rem" }}>
                          <i className="fas fa-user-pen"></i> Reported version: {g.note.scribe.fullName}
                        </div>
                      )}

                      {g.note ? (
                        <button
                          onClick={() => window.open(`/notes/${g.note!.id}/read`, "_blank")}
                          style={{ background: "none", border: "none", padding: 0, marginTop: "0.3rem", cursor: "pointer", fontSize: "0.8rem", color: "var(--text-secondary)", textDecoration: "underline" }}
                        >
                          <i className="fas fa-book-open"></i> View reported version &rarr;
                        </button>
                      ) : (
                        g.block && (
                          <button
                            onClick={() => window.open(`/blocks/${g.block!.id}`, "_blank")}
                            style={{ background: "none", border: "none", padding: 0, marginTop: "0.3rem", cursor: "pointer", fontSize: "0.8rem", color: "var(--text-secondary)", textDecoration: "underline" }}
                          >
                            View block &rarr;
                          </button>
                        )
                      )}

                      <div>
                        <button
                          onClick={() => toggleExpanded(g.key)}
                          style={{ background: "none", border: "none", padding: 0, marginTop: "0.5rem", cursor: "pointer", fontSize: "0.8rem", color: "var(--text-info)" }}
                        >
                          <i className={`fas fa-chevron-${isExpanded ? "up" : "down"}`}></i>{" "}
                          {isExpanded ? "Hide" : "View"} claim{count === 1 ? "" : "s"} ({count})
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                      {unrefundedClaims.length === 1 && (
                        <button
                          className="btn press-on-tap"
                          style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "white" }}
                          disabled={refunding === unrefundedClaims[0].purchase!.id}
                          onClick={() => handleRefund(unrefundedClaims[0].purchase!.id)}
                        >
                          <i className="fas fa-hand-holding-dollar"></i>{" "}
                          {refunding === unrefundedClaims[0].purchase!.id ? "Refunding..." : "Refund"}
                        </button>
                      )}
                      {g.note && (
                        <button
                          className="btn press-on-tap"
                          style={{ background: "var(--text-danger)", borderColor: "var(--text-danger)", color: "white" }}
                          onClick={() => setRemovingNoteId((cur) => (cur === g.note!.id ? null : g.note!.id))}
                        >
                          <i className="fas fa-trash"></i> Remove this version
                        </button>
                      )}
                      <button className="btn" disabled={dismissing === g.key} onClick={() => handleDismissGroup(g)}>
                        <i className="fas fa-times"></i> {dismissing === g.key ? "Dismissing..." : "Dismiss all"}
                      </button>
                      <button className="btn" onClick={() => startReply({ kind: "group", key: g.key })}>
                        <i className="fas fa-reply-all"></i> Reply to all
                      </button>
                    </div>
                  </div>

                  {isGroupReplyOpen && (
                    <ReplyBox
                      value={replyText}
                      onChange={setReplyText}
                      onCancel={() => setReplyTarget(null)}
                      onSend={() => sendReply(allReporters)}
                      sending={replySending}
                      placeholder={`Message all ${count} reporter${count === 1 ? "" : "s"}...`}
                    />
                  )}

                  {isExpanded && (
                    <div style={{ borderTop: "1px solid var(--border-blue)", paddingTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                      {g.reports.map((r) => {
                        const isClaimReplyOpen = replyTarget?.kind === "claim" && replyTarget.reportId === r.id;
                        return (
                          <div key={r.id} style={{ background: "var(--bg-info)", borderRadius: "10px", padding: "0.7rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", flexWrap: "wrap" }}>
                              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                                {r.reporter.fullName} ({r.reporter.email}) · {new Date(r.createdAt).toLocaleDateString()}
                                {r.type === "REFUND" && r.purchase && (
                                  <>
                                    {" "}
                                    · wants a refund for{" "}
                                    {r.purchase.amountPaid === 0
                                      ? `a ₦${r.purchase.creditApplied.toLocaleString()} credit purchase`
                                      : `₦${r.purchase.amountPaid.toLocaleString()}${r.purchase.creditApplied > 0 ? ` (+₦${r.purchase.creditApplied.toLocaleString()} credit)` : ""}`}{" "}
                                    paid{" "}
                                    {new Date(r.purchase.purchasedAt).toLocaleDateString()}
                                    {r.purchase.refundedAt && <span style={{ color: "var(--text-danger)" }}> · already refunded</span>}
                                  </>
                                )}
                              </div>
                              <div style={{ display: "flex", gap: "0.4rem" }}>
                                {r.type === "REFUND" && r.purchase && !r.purchase.refundedAt && (
                                  <button
                                    className="btn press-on-tap"
                                    style={{ padding: "0.25rem 0.7rem", fontSize: "0.78rem", background: "var(--accent)", borderColor: "var(--accent)", color: "white" }}
                                    disabled={refunding === r.purchase.id}
                                    onClick={() => handleRefund(r.purchase!.id)}
                                  >
                                    <i className="fas fa-hand-holding-dollar"></i> {refunding === r.purchase.id ? "Refunding..." : "Refund"}
                                  </button>
                                )}
                                <button
                                  className="btn"
                                  style={{ padding: "0.25rem 0.7rem", fontSize: "0.78rem" }}
                                  onClick={() => startReply({ kind: "claim", reportId: r.id })}
                                >
                                  <i className="fas fa-reply"></i> Reply
                                </button>
                              </div>
                            </div>
                            <p style={{ fontSize: "0.85rem", color: "var(--text-primary)", marginTop: "0.4rem", whiteSpace: "pre-wrap" }}>
                              &ldquo;{r.reason}&rdquo;
                            </p>
                            {isClaimReplyOpen && (
                              <ReplyBox
                                value={replyText}
                                onChange={setReplyText}
                                onCancel={() => setReplyTarget(null)}
                                onSend={() => sendReply([r.reporter])}
                                sending={replySending}
                                placeholder={`Message ${r.reporter.fullName}...`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {g.note && removingNoteId === g.note.id && (
                    <div style={{ borderTop: "1px solid var(--border-blue)", paddingTop: "0.8rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                      <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        Why is {g.note.scribe.fullName}&apos;s version being removed? This is sent to them directly, and
                        counts against their trust level.
                      </label>
                      <textarea
                        value={removeReason}
                        onChange={(e) => setRemoveReason(e.target.value)}
                        rows={2}
                        placeholder="e.g. Contains pages from a different course entirely..."
                        style={{
                          padding: "0.5rem",
                          borderRadius: "10px",
                          border: "1px solid var(--border-blue)",
                          fontFamily: "inherit",
                          fontSize: "0.85rem",
                          background: "var(--surface)",
                          color: "var(--text-primary)",
                        }}
                      />
                      <div style={{ display: "flex", gap: "0.6rem" }}>
                        <button className="btn btn-primary press-on-tap" disabled={removeSubmitting} onClick={() => handleRemoveVersion(g.note!.id)}>
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
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReplyBox({
  value,
  onChange,
  onSend,
  onCancel,
  sending,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onCancel: () => void;
  sending: boolean;
  placeholder: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder={placeholder}
        style={{
          padding: "0.5rem",
          borderRadius: "10px",
          border: "1px solid var(--border-blue)",
          fontFamily: "inherit",
          fontSize: "0.85rem",
          background: "var(--surface)",
          color: "var(--text-primary)",
        }}
      />
      <div style={{ display: "flex", gap: "0.6rem" }}>
        <button className="btn btn-primary press-on-tap" disabled={sending} onClick={onSend}>
          {sending ? "Sending..." : "Send"}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
import { SkeletonList } from "@/app/components/Skeleton";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { displayEmail } from "@/lib/deleted-user";

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
      toast.success(`Refunded. ₦${data.creditGranted.toLocaleString()} added to the buyer's credit — this sale never reached the scribe or the platform.`);
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
      <AdminPageHeader
        section="Complaints"
        serif="Reports"
        subtitle="Content reports and refund requests from students. Reports about the same block, note version, or user are combined into one card — every action resolves every pending report in it and notifies the reporter(s)."
      >
        <button className="btn btn-ghost" onClick={() => router.push("/admin/appeals")}>
          {AIcon.warn()} Appeals
        </button>
        <button className="btn btn-ghost" onClick={() => router.push("/admin")}>
          {AIcon.back()} Admin
        </button>
      </AdminPageHeader>

      {loading && <SkeletonList rows={3} />}
      {error && <div className="auth-error" style={{ marginBottom: "1rem" }}>{error}</div>}
      {!loading && !error && groups.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">{AIcon.check()}</div>
          <h3 className="empty-title">No open reports</h3>
          <p className="empty-desc">Everything&apos;s been resolved.</p>
        </div>
      )}

      <div className="stack-10">
        {groups.map((g) => {
          const isUser = !g.note && !g.block && !!g.reportedUser;
          const label = isUser ? "User report" : "Block report";
          const count = g.reports.length;
          const isExpanded = expanded.has(g.key);
          const unrefundedClaims = g.reports.filter((r) => r.type === "REFUND" && r.purchase && !r.purchase.refundedAt);
          const allReporters = g.reports.map((r) => r.reporter);
          const isGroupReplyOpen = replyTarget?.kind === "group" && replyTarget.key === g.key;

          return (
            <div key={g.key} className="request-item is-column">
              <div className="request-top">
                <div className="request-body" style={{ flex: "1 1 300px" }}>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
                    <span className={`status ${isUser ? "danger" : "info"}`}>{label}</span>
                    <span className="status danger">{count === 1 ? "1 report" : `${count} reports`}</span>
                  </div>

                  {g.block && (
                    <>
                      <div className="request-code">
                        {g.block.course.code} · {g.block.course.name}
                      </div>
                      <div className="request-topic">{g.block.title}</div>
                    </>
                  )}
                  {isUser && g.reportedUser && (
                    <>
                      <div className="request-code">
                        {displayEmail(g.reportedUser.email)} · {g.reportedUser.role}
                      </div>
                      <div className="request-topic">{g.reportedUser.fullName}</div>
                    </>
                  )}

                  {g.note && (
                    <div className="request-meta">
                      <span>
                        {AIcon.user()} Reported version: {g.note.scribe.fullName}
                      </span>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
                    {g.note ? (
                      <button className="text-btn" onClick={() => window.open(`/notes/${g.note!.id}/read`, "_blank")}>
                        {AIcon.eye()} View reported version
                      </button>
                    ) : (
                      g.block && (
                        <button className="text-btn" onClick={() => window.open(`/blocks/${g.block!.id}`, "_blank")}>
                          {AIcon.eye()} View block
                        </button>
                      )
                    )}
                    <button className="text-btn" onClick={() => toggleExpanded(g.key)}>
                      {isExpanded ? AIcon.chevronUp() : AIcon.chevronDown()} {isExpanded ? "Hide" : "View"} claim{count === 1 ? "" : "s"} ({count})
                    </button>
                  </div>
                </div>

                <div className="request-actions">
                  {unrefundedClaims.length === 1 && (
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={refunding === unrefundedClaims[0].purchase!.id}
                      onClick={() => handleRefund(unrefundedClaims[0].purchase!.id)}
                    >
                      {refunding === unrefundedClaims[0].purchase!.id ? "Refunding..." : "Refund"}
                    </button>
                  )}
                  {g.note && (
                    <button className="btn btn-sm btn-danger" onClick={() => setRemovingNoteId((cur) => (cur === g.note!.id ? null : g.note!.id))}>
                      {AIcon.trash()} Remove version
                    </button>
                  )}
                  <button className="btn btn-sm btn-ghost" disabled={dismissing === g.key} onClick={() => handleDismissGroup(g)}>
                    {dismissing === g.key ? "Dismissing..." : "Dismiss all"}
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => startReply({ kind: "group", key: g.key })}>
                    {AIcon.reply()} Reply to all
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
                <div className="request-extra">
                  {g.reports.map((r) => {
                    const isClaimReplyOpen = replyTarget?.kind === "claim" && replyTarget.reportId === r.id;
                    return (
                      <div key={r.id} className="claim">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", flexWrap: "wrap" }}>
                          <div className="claim-meta">
                            {r.reporter.fullName} ({displayEmail(r.reporter.email)}) · {new Date(r.createdAt).toLocaleDateString()}
                            {r.type === "REFUND" && r.purchase && (
                              <>
                                {" "}
                                · wants a refund for{" "}
                                {r.purchase.amountPaid === 0
                                  ? `a ₦${r.purchase.creditApplied.toLocaleString()} credit purchase`
                                  : `₦${r.purchase.amountPaid.toLocaleString()}${r.purchase.creditApplied > 0 ? ` (+₦${r.purchase.creditApplied.toLocaleString()} credit)` : ""}`}{" "}
                                paid {new Date(r.purchase.purchasedAt).toLocaleDateString()}
                                {r.purchase.refundedAt && <span style={{ color: "var(--text-danger)" }}> · already refunded</span>}
                              </>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: "0.4rem" }}>
                            {r.type === "REFUND" && r.purchase && !r.purchase.refundedAt && (
                              <button className="btn btn-sm btn-primary" disabled={refunding === r.purchase.id} onClick={() => handleRefund(r.purchase!.id)}>
                                {refunding === r.purchase.id ? "Refunding..." : "Refund"}
                              </button>
                            )}
                            <button className="btn btn-sm btn-ghost" onClick={() => startReply({ kind: "claim", reportId: r.id })}>
                              {AIcon.reply()} Reply
                            </button>
                          </div>
                        </div>
                        <p className="claim-text">&ldquo;{r.reason}&rdquo;</p>
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
                <div className="request-extra">
                  <label className="form-label" style={{ textTransform: "none", letterSpacing: 0, fontSize: "0.8rem", fontWeight: 500 }}>
                    Why is {g.note.scribe.fullName}&apos;s version being removed? This is sent to them directly, and counts against their trust level.
                  </label>
                  <textarea
                    className="textarea"
                    value={removeReason}
                    onChange={(e) => setRemoveReason(e.target.value)}
                    rows={2}
                    placeholder="e.g. Contains pages from a different course entirely..."
                  />
                  <div className="form-actions">
                    <button className="btn btn-primary" disabled={removeSubmitting} onClick={() => handleRemoveVersion(g.note!.id)}>
                      {removeSubmitting ? "Removing..." : "Confirm removal"}
                    </button>
                    <button
                      className="btn btn-ghost"
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
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.6rem" }}>
      <textarea className="textarea" value={value} onChange={(e) => onChange(e.target.value)} rows={2} placeholder={placeholder} />
      <div className="form-actions">
        <button className="btn btn-primary btn-sm" disabled={sending} onClick={onSend}>
          {sending ? "Sending..." : "Send"}
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

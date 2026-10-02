"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
import Avatar from "@/app/components/Avatar";
import { SkeletonList } from "@/app/components/Skeleton";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { PAYOUTS_AUTOMATED } from "@/lib/payout-mode";
import { displayEmail } from "@/lib/deleted-user";

interface PayoutItem {
  id: string;
  amount: number;
  status: "PENDING" | "PROCESSING";
  requestedAt: string;
  scribe: {
    id: string;
    fullName: string;
    email: string;
    bankName: string | null;
    accountNumber: string | null;
    accountName: string | null;
  };
}

export default function AdminPayoutsPage() {
  const router = useRouter();
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

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
    apiFetch("/api/admin/payouts")
      .then((data) => setPayouts(data.payouts))
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  async function handleApprove(id: string) {
    setActionMessage("");
    setBusyId(id);
    try {
      await apiFetch(`/api/admin/payouts/${id}/approve`, { method: "POST" });
      setActionMessage("Approved — now send the money yourself, then come back and mark it paid.");
      load();
    } catch (err) {
      setActionMessage(friendlyErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleMarkPaid(id: string) {
    setActionMessage("");
    setBusyId(id);
    try {
      await apiFetch(`/api/admin/payouts/${id}/mark-paid`, { method: "POST" });
      setActionMessage("Marked as paid.");
      setPayouts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setActionMessage(friendlyErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  // Asks Paystack what happened to a transfer that's still "processing"
  // and applies the answer with the same rules as the webhook.
  async function handleReconcile(id: string) {
    setActionMessage("");
    setBusyId(id);
    try {
      const data = await apiFetch(`/api/admin/payouts/${id}/reconcile`, { method: "POST" });
      setActionMessage(
        data?.message ||
          (data?.settled
            ? `Paystack says "${data.paystackStatus}" — the payout has been updated.`
            : `Paystack says "${data?.paystackStatus ?? "unknown"}". Nothing was changed.`)
      );
      load();
    } catch (err) {
      setActionMessage(friendlyErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    setActionMessage("");
    try {
      await apiFetch(`/api/admin/payouts/${id}/reject`, { method: "POST" });
      setActionMessage("Payout request rejected.");
      setPayouts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setActionMessage(friendlyErrorMessage(err));
    }
  }

  return (
    <div className="page-wrap">
      <AdminPageHeader
        section="Money out"
        serif="Payouts"
        subtitle={
          <>
            Money moves manually for now — Paystack Transfers needs a Registered Business account first. <strong>Approve</strong> accepts the
            request; you then send the money yourself using the account details shown, and click <strong>Mark as paid</strong> once it&apos;s sent.
          </>
        }
      >
        <button className="btn btn-ghost" onClick={() => router.push("/admin/finance")}>
          {AIcon.chart()} Financial ledger
        </button>
        <button className="btn btn-ghost" onClick={() => router.push("/admin")}>
          {AIcon.back()} Admin
        </button>
      </AdminPageHeader>

      {loading && <SkeletonList rows={3} />}
      {error && <div className="auth-error">{error}</div>}
      {actionMessage && <div className="notice">{actionMessage}</div>}

      {!loading && !error && payouts.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">{AIcon.coin()}</div>
          <h3 className="empty-title">Nothing to pay out</h3>
          <p className="empty-desc">No withdrawal requests are waiting on you.</p>
        </div>
      )}

      <div className="stack-10">
        {payouts.map((p) => (
          <div key={p.id} className={`person-card${p.status === "PROCESSING" ? " is-active" : ""}`}>
            <Avatar name={p.scribe.fullName} />
            <div className="person-info">
              <div className="person-name-row">
                <span className="person-name">{p.scribe.fullName}</span>
                {p.status === "PROCESSING" ? <span className="status info">Waiting for you to send</span> : <span className="status plum">Pending</span>}
              </div>
              <div className="person-stats">
                <span>
                  {AIcon.coin()} <strong>₦{p.amount.toLocaleString()}</strong>
                </span>
                <span>
                  {AIcon.mail()} {displayEmail(p.scribe.email)}
                </span>
                <span>
                  {AIcon.clock()} Requested {new Date(p.requestedAt).toLocaleDateString()}
                </span>
              </div>
              <div className="person-stats" style={{ marginTop: 6 }}>
                <span>
                  {p.scribe.bankName} · {p.scribe.accountName} · {p.scribe.accountNumber}
                </span>
              </div>
            </div>
            <div className="request-actions">
              {p.status === "PENDING" ? (
                <>
                  <button className="btn btn-sm btn-danger" onClick={() => handleReject(p.id)}>
                    Reject
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={() => handleApprove(p.id)} disabled={busyId === p.id}>
                    {busyId === p.id ? "Approving..." : "Approve"}
                  </button>
                </>
              ) : (
                <>
                  {PAYOUTS_AUTOMATED && (
                    <button className="btn btn-sm btn-ghost" onClick={() => handleReconcile(p.id)} disabled={busyId === p.id}>
                      {busyId === p.id ? "Checking..." : "Check with Paystack"}
                    </button>
                  )}
                  <button className="btn btn-sm btn-success" onClick={() => handleMarkPaid(p.id)} disabled={busyId === p.id}>
                    {AIcon.check()} {busyId === p.id ? "Saving..." : "Mark as paid"}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

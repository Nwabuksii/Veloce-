"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import PageHeader from "@/app/components/PageHeader";
import { SkeletonList } from "@/app/components/Skeleton";
import { Icon } from "@/app/components/icons";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import ExportButton from "@/app/components/ExportButton";

interface BlockEarning {
  blockId: string;
  blockTitle: string;
  courseCode: string;
  salesCount: number;
  earnings: number;
  pending: number;
  pendingCount: number;
}

interface BankAccount {
  bankCode: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
}

interface Bank {
  name: string;
  code: string;
}

interface PayoutItem {
  id: string;
  amount: number;
  status: "PENDING" | "PROCESSING" | "PAID" | "FAILED";
  requestedAt: string;
  paidAt: string | null;
  failureReason: string | null;
}

const STATUS_STYLES: Record<PayoutItem["status"], { cls: string; label: string }> = {
  PENDING: { cls: "pending", label: "Pending review" },
  PROCESSING: { cls: "processing", label: "Processing" },
  PAID: { cls: "paid", label: "Paid" },
  FAILED: { cls: "failed", label: "Failed" },
};

const naira = (n: number) => `₦${n.toLocaleString()}`;

// Counts up from 0 to the real total over ~900ms — just enough motion to
// feel like "your earnings, going up" without being gimmicky.
function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (target === 0) {
      setValue(0);
      return;
    }
    let start: number | null = null;
    let frame: number;

    function step(timestamp: number) {
      if (start === null) start = timestamp;
      const progress = Math.min((timestamp - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    }

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}

export default function ScribeEarningsPage() {
  const router = useRouter();
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [totalSales, setTotalSales] = useState(0);
  const [pendingEarnings, setPendingEarnings] = useState(0);
  const [pendingSales, setPendingSales] = useState(0);
  const [refundWindowMinutes, setRefundWindowMinutes] = useState(30);
  const [byBlock, setByBlock] = useState<BlockEarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [balance, setBalance] = useState(0);
  const [eligible, setEligible] = useState(false);
  const [eligibilityReason, setEligibilityReason] = useState("");
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);

  const [account, setAccount] = useState<BankAccount | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [editingAccount, setEditingAccount] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState("");

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [withdrawStatus, setWithdrawStatus] = useState("");

  const displayedEarnings = useCountUp(totalEarnings);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
      return;
    }
    if (user.role !== "SCRIBE" && user.role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }
    loadEarnings();
    loadPayouts();
    loadAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function loadEarnings() {
    apiFetch("/api/scribe/earnings")
      .then((data) => {
        setTotalEarnings(data.totalEarnings);
        setTotalSales(data.totalSales);
        setPendingEarnings(data.pendingEarnings);
        setPendingSales(data.pendingSales);
        setRefundWindowMinutes(data.refundWindowMinutes);
        setByBlock(data.byBlock);
      })
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  function loadPayouts() {
    apiFetch("/api/scribe/payouts")
      .then((data) => {
        setBalance(data.balance);
        setEligible(data.eligibility.eligible);
        setEligibilityReason(data.eligibility.reason || "");
        setPayouts(data.payouts);
      })
      .catch(() => {});
  }

  function loadAccount() {
    apiFetch("/api/scribe/payout-account")
      .then((data) => {
        setAccount(data.account);
        setBanks(data.banks);
        setEditingAccount(!data.account?.accountNumber);
      })
      .catch(() => {});
  }

  async function handleSaveAccount(e: FormEvent) {
    e.preventDefault();
    setAccountError("");

    if (!bankCode || accountNumber.length !== 10) {
      setAccountError("Pick a bank and enter a 10-digit account number.");
      return;
    }

    setAccountSaving(true);
    try {
      const data = await apiFetch("/api/scribe/payout-account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankCode, accountNumber }),
      });
      setAccount(data.account);
      setEditingAccount(false);
    } catch (err) {
      setAccountError(friendlyErrorMessage(err));
    } finally {
      setAccountSaving(false);
    }
  }

  async function handleWithdraw(e: FormEvent) {
    e.preventDefault();
    setWithdrawStatus("");

    const amount = parseInt(withdrawAmount, 10);
    if (!amount || amount <= 0) {
      setWithdrawStatus("Enter a valid amount.");
      return;
    }

    setWithdrawSubmitting(true);
    try {
      await apiFetch("/api/scribe/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      setWithdrawStatus("Withdrawal requested — an admin will process it soon.");
      setWithdrawAmount("");
      loadPayouts();
    } catch (err) {
      setWithdrawStatus(friendlyErrorMessage(err));
    } finally {
      setWithdrawSubmitting(false);
    }
  }

  const hasAccount = Boolean(account?.accountNumber);

  function scrollToWithdraw() {
    document.getElementById("withdraw")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Scribe · Money"
        title="Your"
        accent="earnings"
        subtitle="What you've earned and been paid. Withdrawals go to your saved bank account once an admin has processed them."
      >
        <ExportButton url="/api/scribe/export" />
        <button className="btn btn-ghost" onClick={() => router.push("/scribe/workspace")}>
          {Icon.back()} Workspace
        </button>
        <button className="btn btn-primary" onClick={scrollToWithdraw}>
          {Icon.coin()} Withdraw
        </button>
      </PageHeader>

      {loading && <SkeletonList rows={3} />}
      {error && <div className="auth-error">{error}</div>}

      {!loading && !error && (
        <>
          <div className="two-col mb-24">
            {/* Balance */}
            <div className="panel balance-hero">
              <div className="form-label">Available balance</div>
              <div className="balance-num">{naira(balance)}</div>
              <div className="chip-row">
                <span className="status paid">{naira(displayedEarnings)} total earned</span>
                {pendingSales > 0 && <span className="status pending">{naira(pendingEarnings)} verifying</span>}
              </div>
              <p className="panel-desc" style={{ marginTop: 14, marginBottom: 0 }}>
                From {totalSales} sale{totalSales === 1 ? "" : "s"}.
              </p>
            </div>

            {/* Bank account */}
            <div className="panel">
              <h2 className="panel-title">{Icon.bank()} Payout account</h2>
              <p className="panel-desc">Where your withdrawals are sent. We verify the account name with your bank when you save it.</p>

              {!editingAccount && hasAccount && (
                <>
                  <div className="info-list">
                    <div className="info-row">
                      <span className="k">Bank</span>
                      <span className="v">{account?.bankName}</span>
                    </div>
                    <div className="info-row">
                      <span className="k">Account number</span>
                      <span className="v">•••• {account?.accountNumber?.slice(-4)}</span>
                    </div>
                    <div className="info-row">
                      <span className="k">Account name</span>
                      <span className="v">{account?.accountName}</span>
                    </div>
                  </div>
                  <div className="flex-end">
                    <button className="btn btn-ghost" onClick={() => setEditingAccount(true)}>
                      Change account
                    </button>
                  </div>
                </>
              )}

              {editingAccount && (
                <form onSubmit={handleSaveAccount}>
                  <div className="form-field">
                    <label className="form-label" htmlFor="bank">Bank</label>
                    <select id="bank" className="select" value={bankCode} onChange={(e) => setBankCode(e.target.value)}>
                      <option value="">Select your bank</option>
                      {banks.map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="form-label" htmlFor="acct">Account number</label>
                    <input
                      id="acct"
                      className="input"
                      type="text"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="10-digit account number"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                  {accountError && <div className="auth-error" style={{ marginBottom: 12 }}>{accountError}</div>}
                  <div className="flex-end is-split" style={{ marginTop: 6 }}>
                    {hasAccount ? (
                      <button className="btn btn-quiet" type="button" onClick={() => setEditingAccount(false)}>
                        Cancel
                      </button>
                    ) : (
                      <span />
                    )}
                    <button className="btn btn-primary" type="submit" disabled={accountSaving}>
                      {accountSaving ? "Verifying..." : "Save & verify"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {pendingSales > 0 && (
            <div className="callout is-warn mb-24">
              {Icon.hourglass()}
              <div>
                <strong>{naira(pendingEarnings)} verifying</strong>
                <div className="callout-sub">
                  {pendingSales} recent sale{pendingSales === 1 ? "" : "s"} — moves to your available balance{" "}
                  {refundWindowMinutes} minutes after purchase, as long as the buyer doesn&apos;t request a refund. You&apos;ll
                  get a message if one does.
                </div>
              </div>
            </div>
          )}

          {/* Withdraw */}
          <div className="panel mb-24" id="withdraw">
            <h2 className="panel-title">{Icon.coin()} Withdraw</h2>

            {!hasAccount && <p className="panel-desc" style={{ marginBottom: 0 }}>Add your bank account above before withdrawing.</p>}

            {hasAccount && !eligible && <p className="panel-desc" style={{ marginBottom: 0 }}>{eligibilityReason}</p>}

            {hasAccount && eligible && (
              <>
                <p className="panel-desc">Enter an amount up to your available balance.</p>
                <form onSubmit={handleWithdraw} className="withdraw-form">
                  <input
                    className="input"
                    type="number"
                    min={2000}
                    max={balance}
                    placeholder={`Up to ${naira(balance)}`}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                  />
                  <button className="btn btn-primary" type="submit" disabled={withdrawSubmitting}>
                    {withdrawSubmitting ? "Requesting..." : "Withdraw"}
                  </button>
                </form>
              </>
            )}
            {withdrawStatus && <p className="panel-desc" style={{ marginTop: 12, marginBottom: 0 }}>{withdrawStatus}</p>}
          </div>

          {/* Payout history */}
          {payouts.length > 0 && (
            <>
              <h2 className="panel-title section-title">{Icon.list()} Payout history</h2>
              <div className="mb-24">
                {payouts.map((p) => (
                  <div key={p.id} className="data-row data-row--tx">
                    <div>
                      <div className="row-title">Withdrawal request</div>
                      <div className="row-code" style={{ marginTop: 4 }}>{new Date(p.requestedAt).toLocaleDateString()}</div>
                    </div>
                    <div className="row-stat" data-label="Amount">
                      <span className="money-neg">−{naira(p.amount)}</span>
                    </div>
                    <div className="row-actions">
                      <span className={`status ${STATUS_STYLES[p.status].cls}`}>{STATUS_STYLES[p.status].label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* By block */}
          <h2 className="panel-title section-title">{Icon.book()} By block</h2>

          {byBlock.length === 0 ? (
            <div className="panel">
              <div className="empty-state">No sales yet — keep uploading!</div>
            </div>
          ) : (
            <div>
              {byBlock.map((b) => (
                <div key={b.blockId} className="data-row data-row--tx">
                  <div>
                    <div className="row-code">{b.courseCode}</div>
                    <div className="row-title">{b.blockTitle}</div>
                    <div className="row-meta">
                      {b.salesCount} sold
                      {b.pendingCount > 0 && ` · ${b.pendingCount} verifying`}
                    </div>
                  </div>
                  <div className="row-stat" data-label="Earned">
                    <span className="money-pos">{naira(b.earnings)}</span>
                  </div>
                  <div className="row-stat" data-label="Pending">
                    {b.pending > 0 ? <span className="money-pos" style={{ color: "var(--text-warning)" }}>+{naira(b.pending)}</span> : <span className="money-pos" style={{ color: "var(--text-muted)" }}>—</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

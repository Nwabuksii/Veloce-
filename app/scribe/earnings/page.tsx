"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { SkeletonList } from "@/app/components/Skeleton";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";

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

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  PENDING: { bg: "var(--bg-warning)", color: "var(--text-warning)", label: "Pending review" },
  PROCESSING: { bg: "var(--bg-info)", color: "var(--text-info)", label: "Processing" },
  PAID: { bg: "var(--bg-success)", color: "var(--text-success)", label: "Paid" },
  FAILED: { bg: "var(--bg-danger)", color: "var(--text-danger)", label: "Failed" },
};

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

  return (
    <div className="page-wrap">
      <div className="app-container" style={{ maxWidth: 560 }}>
        <div className="top-bar">
          <div className="logo" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Logo size={34} />
            <div>
              <h1>
                Veloce <span className="accent">.</span>
              </h1>
              <div className="logo-sub">Your earnings</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="btn" onClick={() => router.push("/scribe/workspace")}>
              <i className="fas fa-arrow-left"></i> Workspace
            </button>
            <ProfileMenu />
          </div>
        </div>

        {loading && <SkeletonList rows={3} />}
        {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}

        {!loading && !error && (
          <div style={{ marginTop: "1.5rem" }}>
            <div
              style={{
                background: "linear-gradient(135deg, var(--text-info), #1b5fb8)",
                borderRadius: "1.2rem",
                padding: "1.8rem",
                color: "white",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "0.85rem", opacity: 0.85 }}>Total earnings</div>
              <div style={{ fontSize: "2.6rem", fontWeight: 700, marginTop: "0.3rem" }}>
                ₦{displayedEarnings.toLocaleString()}
              </div>
              <div style={{ fontSize: "0.85rem", opacity: 0.85, marginTop: "0.4rem" }}>
                From {totalSales} sale{totalSales === 1 ? "" : "s"} · ₦{balance.toLocaleString()} available to withdraw
              </div>
            </div>

            {pendingSales > 0 && (
              <div
                style={{
                  marginTop: "0.8rem",
                  background: "var(--bg-warning)",
                  border: "1px solid var(--text-warning)",
                  borderRadius: "0.9rem",
                  padding: "1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.6rem",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text-warning)" }}>
                    <i className="fas fa-hourglass-half"></i> ₦{pendingEarnings.toLocaleString()} verifying
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                    {pendingSales} recent sale{pendingSales === 1 ? "" : "s"} — moves to your available balance{" "}
                    {refundWindowMinutes} minutes after purchase, as long as the buyer doesn't request a refund. You'll
                    get a message if one does.
                  </div>
                </div>
              </div>
            )}

            {/* Bank account */}
            <h3 style={{ marginTop: "1.5rem", fontSize: "1.05rem" }}>
              <i className="fas fa-university" style={{ color: "var(--text-info)" }}></i> Bank account
            </h3>

            {!editingAccount && hasAccount && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border-blue)", borderRadius: "0.9rem", padding: "1rem", marginTop: "0.6rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{account?.accountName}</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    {account?.bankName} · •••• {account?.accountNumber?.slice(-4)}
                  </div>
                </div>
                <button className="btn" onClick={() => setEditingAccount(true)}>
                  Change
                </button>
              </div>
            )}

            {editingAccount && (
              <form onSubmit={handleSaveAccount} style={{ marginTop: "0.6rem", background: "var(--surface)", border: "1px solid var(--border-blue)", borderRadius: "0.9rem", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                <select
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  style={{ padding: "0.6rem", borderRadius: "0.6rem", border: "1px solid var(--border-blue)" }}
                >
                  <option value="">Select your bank</option>
                  {banks.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10-digit account number"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                  style={{ padding: "0.6rem", borderRadius: "0.6rem", border: "1px solid var(--border-blue)" }}
                />
                {accountError && <p style={{ color: "var(--text-danger)", fontSize: "0.85rem" }}>{accountError}</p>}
                <div style={{ display: "flex", gap: "0.6rem" }}>
                  <button className="btn btn-primary" type="submit" disabled={accountSaving}>
                    {accountSaving ? "Verifying..." : "Save & verify"}
                  </button>
                  {hasAccount && (
                    <button className="btn" type="button" onClick={() => setEditingAccount(false)}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            )}

            {/* Withdraw */}
            <h3 style={{ marginTop: "1.5rem", fontSize: "1.05rem" }}>
              <i className="fas fa-money-bill-wave" style={{ color: "var(--text-info)" }}></i> Withdraw
            </h3>

            {!hasAccount && (
              <p style={{ color: "var(--text-secondary)", marginTop: "0.6rem" }}>Add your bank account above before withdrawing.</p>
            )}

            {hasAccount && !eligible && (
              <p style={{ color: "var(--text-secondary)", marginTop: "0.6rem" }}>{eligibilityReason}</p>
            )}

            {hasAccount && eligible && (
              <form onSubmit={handleWithdraw} style={{ marginTop: "0.6rem", display: "flex", gap: "0.6rem" }}>
                <input
                  type="number"
                  min={2000}
                  max={balance}
                  placeholder={`Up to ₦${balance.toLocaleString()}`}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  style={{ flex: 1, padding: "0.6rem", borderRadius: "0.6rem", border: "1px solid var(--border-blue)" }}
                />
                <button className="btn btn-primary" type="submit" disabled={withdrawSubmitting}>
                  {withdrawSubmitting ? "Requesting..." : "Withdraw"}
                </button>
              </form>
            )}
            {withdrawStatus && <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.5rem" }}>{withdrawStatus}</p>}

            {payouts.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.8rem" }}>
                {payouts.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", background: "var(--surface)", border: "1px solid var(--border-blue)", borderRadius: "0.7rem", padding: "0.6rem 0.8rem" }}>
                    <span>
                      ₦{p.amount.toLocaleString()} · {new Date(p.requestedAt).toLocaleDateString()}
                    </span>
                    <span
                      style={{
                        background: STATUS_STYLES[p.status].bg,
                        color: STATUS_STYLES[p.status].color,
                        padding: "0.15rem 0.6rem",
                        borderRadius: "30px",
                        fontWeight: 600,
                        fontSize: "0.75rem",
                      }}
                    >
                      {STATUS_STYLES[p.status].label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* By block */}
            <h3 style={{ marginTop: "1.5rem", fontSize: "1.05rem" }}>
              <i className="fas fa-layer-group" style={{ color: "var(--text-info)" }}></i> By block
            </h3>

            {byBlock.length === 0 && (
              <p style={{ color: "var(--text-secondary)", marginTop: "0.6rem" }}>No sales yet — keep uploading!</p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem", marginTop: "0.8rem" }}>
              {byBlock.map((b) => (
                <div
                  key={b.blockId}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border-blue)",
                    borderRadius: "0.9rem",
                    padding: "0.9rem 1rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{b.blockTitle}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      {b.courseCode} · {b.salesCount} sold
                      {b.pendingCount > 0 && ` · ${b.pendingCount} verifying`}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, color: "var(--text-success)" }}>₦{b.earnings.toLocaleString()}</div>
                    {b.pending > 0 && (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-warning)" }}>+₦{b.pending.toLocaleString()} pending</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

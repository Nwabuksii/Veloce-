"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { SkeletonList } from "@/app/components/Skeleton";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";

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
      <div className="app-container">
        <div className="top-bar">
          <div className="logo" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Logo size={34} />
            <div>
              <h1>
                Veloce <span className="accent">.</span>
              </h1>
              <div className="logo-sub">Admin control hub</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="btn" onClick={() => router.push("/admin")}>
              <i className="fas fa-arrow-left"></i> Applications
            </button>
            <ProfileMenu />
          </div>
        </div>

        <div style={{ marginTop: "1.5rem" }}>
          <h2>
            <i className="fas fa-money-bill-wave" style={{ color: "var(--text-info)" }}></i> Withdrawal requests
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "0.4rem" }}>
            Money moves manually for now — Paystack Transfers needs your account upgraded to a Registered
            Business first. <strong>Approve</strong> just accepts the request; you then send the money yourself
            using the account details shown, and click <strong>Mark as paid</strong> once it's actually sent.
          </p>

          {loading && <SkeletonList rows={3} />}
          {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}
          {actionMessage && <p style={{ marginTop: "1rem", color: "var(--text-success)" }}>{actionMessage}</p>}
          {!loading && !error && payouts.length === 0 && (
            <p style={{ marginTop: "1rem", color: "var(--text-secondary)" }}>No withdrawal requests waiting on you.</p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", marginTop: "1rem" }}>
            {payouts.map((p) => (
              <div
                key={p.id}
                style={{
                  background: "var(--surface)",
                  border: p.status === "PROCESSING" ? "2px solid var(--text-info)" : "1px solid var(--border-blue)",
                  borderRadius: "1rem",
                  padding: "1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.6rem",
                }}
              >
                <div>
                  {p.status === "PROCESSING" && (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-info)", fontWeight: 600, marginBottom: "0.2rem" }}>
                      <i className="fas fa-hand-holding-dollar"></i> Waiting for you to send this
                    </div>
                  )}
                  <strong>{p.scribe.fullName}</strong> — ₦{p.amount.toLocaleString()}
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    {p.scribe.email} · Requested {new Date(p.requestedAt).toLocaleDateString()}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    {p.scribe.bankName} · {p.scribe.accountName} · {p.scribe.accountNumber}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.6rem" }}>
                  {p.status === "PENDING" ? (
                    <>
                      <button
                        className="btn"
                        style={{ background: "var(--text-success)", borderColor: "var(--text-success)", color: "white" }}
                        onClick={() => handleApprove(p.id)}
                        disabled={busyId === p.id}
                      >
                        <i className="fas fa-check"></i> {busyId === p.id ? "Approving..." : "Approve"}
                      </button>
                      <button className="btn" onClick={() => handleReject(p.id)}>
                        <i className="fas fa-times"></i> Reject
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn"
                      style={{ background: "var(--text-success)", borderColor: "var(--text-success)", color: "white" }}
                      onClick={() => handleMarkPaid(p.id)}
                      disabled={busyId === p.id}
                    >
                      <i className="fas fa-check-double"></i> {busyId === p.id ? "Saving..." : "Mark as paid"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

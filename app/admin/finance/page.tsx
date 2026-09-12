"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import Avatar from "@/app/components/Avatar";
import { SkeletonStatRow, SkeletonList } from "@/app/components/Skeleton";
import { friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";

interface Transaction {
  id: string;
  buyerName: string;
  scribeName: string;
  blockTitle: string;
  courseCode: string;
  amountPaid: number;
  discountApplied: boolean;
  refunded: boolean;
  redeemedWithCoupon: boolean;
  purchasedAt: string;
}

interface FinanceData {
  grossRevenue: number;
  platformRevenue: number;
  scribePool: number;
  transactionCount: number;
  scribeSharePercent: number;
  platformSharePercent: number;
  couponsIssued: number;
  couponsRedeemed: number;
  couponsOutstanding: number;
  recentTransactions: Transaction[];
}

const VISIBLE_TRANSACTIONS = 8;

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card card-hover">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function AdminFinancePage() {
  const router = useRouter();
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

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

    fetch("/api/admin/finance")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load financial data");
        setData(json);
      })
      .catch((err) => {
        const message = friendlyErrorMessage(err);
        setError(message);
        toast.error(message);
      })
      .finally(() => setLoading(false));
  }, [router]);

  const visibleTransactions = data
    ? showAll
      ? data.recentTransactions
      : data.recentTransactions.slice(0, VISIBLE_TRANSACTIONS)
    : [];

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
              <div className="logo-sub">Financial ledger</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="btn" onClick={() => router.push("/admin")}>
              <i className="fas fa-arrow-left"></i> Applications
            </button>
            <ProfileMenu />
          </div>
        </div>

        {loading && (
          <>
            <SkeletonStatRow count={3} />
            <h2 style={{ marginTop: "2rem" }}>
              <i className="fas fa-receipt" style={{ color: "var(--text-info)" }}></i> Recent transactions
            </h2>
            <div style={{ marginTop: "1rem" }}>
              <SkeletonList rows={5} />
            </div>
          </>
        )}

        {error && !loading && (
          <div className="auth-error" style={{ marginTop: "1rem" }}>
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Hierarchy: one hero number, three quieter secondary cards */}
            <div className="stat-row">
              <div className="stat-hero card-hover">
                <div className="stat-label">Gross revenue</div>
                <div className="stat-value">₦{data.grossRevenue.toLocaleString()}</div>
                <div className="stat-sub">
                  <span>{data.transactionCount} transactions total</span>
                </div>
              </div>

              <div className="stat-secondary-group">
                <StatCard
                  label="Platform revenue"
                  value={`₦${data.platformRevenue.toLocaleString()}`}
                  sub={`${data.platformSharePercent}% of gross`}
                />
                <StatCard
                  label="Scribe pool"
                  value={`₦${data.scribePool.toLocaleString()}`}
                  sub={`${data.scribeSharePercent}% of gross, owed across all scribes`}
                />
              </div>
            </div>

            <h2 style={{ marginTop: "2rem" }}>
              <i className="fas fa-ticket" style={{ color: "var(--star)" }}></i> Coupons
            </h2>
            <div className="stat-row" style={{ marginTop: "0.8rem" }}>
              <StatCard label="Issued" value={String(data.couponsIssued)} sub="1 per successful refund" />
              <StatCard label="Redeemed" value={String(data.couponsRedeemed)} sub="used on a free purchase" />
              <StatCard label="Outstanding" value={String(data.couponsOutstanding)} sub="sitting unused right now" />
            </div>

            <h2 style={{ marginTop: "2rem" }}>
              <i className="fas fa-receipt" style={{ color: "var(--text-info)" }}></i> Recent transactions
            </h2>

            {data.recentTransactions.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", marginTop: "1rem" }}>No purchases yet.</p>
            ) : (
              <>
                <div className="tx-list">
                  {visibleTransactions.map((t) => (
                    <div key={t.id} className="tx-row card-hover">
                      <Avatar name={t.buyerName} />
                      <div className="tx-row-main">
                        <div className="tx-row-title">
                          {t.courseCode} — {t.blockTitle}
                        </div>
                        <div className="tx-row-meta">
                          {t.buyerName} bought from {t.scribeName}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
                        {t.discountApplied && <span className="pill pill-info">Fixed request price</span>}
                        {t.refunded ? (
                          <span className="pill" style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}>Refunded</span>
                        ) : t.redeemedWithCoupon ? (
                          <span className="pill" style={{ background: "var(--bg-pro)", color: "var(--text-pro)" }}>
                            <i className="fas fa-ticket"></i> Coupon
                          </span>
                        ) : (
                          <span className="pill pill-success">Paid</span>
                        )}
                        <div className="tx-row-amount">
                          <div className="amount">₦{t.amountPaid.toLocaleString()}</div>
                          <div className="date">{new Date(t.purchasedAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {!showAll && data.recentTransactions.length > VISIBLE_TRANSACTIONS && (
                  <button
                    className="btn press-on-tap"
                    style={{ marginTop: "1rem" }}
                    onClick={() => setShowAll(true)}
                  >
                    View all {data.recentTransactions.length} transactions
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

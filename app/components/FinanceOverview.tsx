"use client";

import { useState } from "react";
import Avatar from "@/app/components/Avatar";

export interface Transaction {
  id: string;
  buyerName: string;
  scribeName: string;
  blockTitle: string;
  courseCode: string;
  amountPaid: number;
  creditApplied: number;
  discountApplied: boolean;
  refunded: boolean;
  disputed: boolean;
  redeemedWithCoupon: boolean;
  purchasedAt: string;
}

export interface FinanceOverviewData {
  grossRevenue: number;
  platformRevenue: number;
  scribePool: number;
  transactionCount: number;
  scribeSharePercent: number;
  platformSharePercent: number;
  creditIssued: number;
  creditRedeemed: number;
  creditOutstanding: number;
  recentTransactions: Transaction[];
}

const VISIBLE_TRANSACTIONS = 8;

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card card-hover">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function TransactionRow({ t }: { t: Transaction }) {
  return (
    <div className="tx-row card-hover">
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
        {t.disputed ? (
          <span className="pill" style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}>
            <i className="fas fa-triangle-exclamation"></i> Disputed
          </span>
        ) : t.refunded ? (
          <span className="pill" style={{ background: "var(--bg-danger)", color: "var(--text-danger)" }}>Refunded</span>
        ) : t.redeemedWithCoupon ? (
          <span className="pill" style={{ background: "var(--bg-pro)", color: "var(--text-pro)" }}>
            <i className="fas fa-ticket"></i> {t.amountPaid === 0 ? "Credit" : `Credit + ₦${t.amountPaid.toLocaleString()}`}
          </span>
        ) : (
          <span className="pill pill-success">Paid</span>
        )}
        <div className="tx-row-amount">
          <div className="amount">₦{t.amountPaid.toLocaleString()}</div>
          {t.creditApplied > 0 && (
            <div style={{ fontSize: "0.7rem", color: "var(--text-pro)" }}>+₦{t.creditApplied.toLocaleString()} credit</div>
          )}
          <div className="date">{new Date(t.purchasedAt).toLocaleDateString()}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * The headline numbers and recent-transaction feed — shared between the
 * plain Financial Ledger page and the Advanced Analytics page, so the two
 * always show the exact same figures (the advanced page just adds more
 * sections below via `children`).
 */
export default function FinanceOverview({ data, children }: { data: FinanceOverviewData; children?: React.ReactNode }) {
  const [showAll, setShowAll] = useState(false);
  const visibleTransactions = showAll ? data.recentTransactions : data.recentTransactions.slice(0, VISIBLE_TRANSACTIONS);

  return (
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
            sub={`${data.platformSharePercent}% of gross, confirmed sales only`}
          />
          <StatCard
            label="Scribe pool"
            value={`₦${data.scribePool.toLocaleString()}`}
            sub={`${data.scribeSharePercent}% of gross, owed across all scribes`}
          />
        </div>
      </div>

      <h2 style={{ marginTop: "2rem" }}>
        <i className="fas fa-ticket" style={{ color: "var(--star)" }}></i> Refund credit
      </h2>
      <div className="stat-row" style={{ marginTop: "0.8rem" }}>
        <StatCard label="Issued" value={`₦${data.creditIssued.toLocaleString()}`} sub="granted across all refunds" />
        <StatCard label="Redeemed" value={`₦${data.creditRedeemed.toLocaleString()}`} sub="applied toward purchases" />
        <StatCard label="Outstanding" value={`₦${data.creditOutstanding.toLocaleString()}`} sub="real money, sitting unspent" />
      </div>

      {children}

      <h2 style={{ marginTop: "2rem" }}>
        <i className="fas fa-receipt" style={{ color: "var(--text-info)" }}></i> Recent transactions
      </h2>

      {data.recentTransactions.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", marginTop: "1rem" }}>No purchases yet.</p>
      ) : (
        <>
          <div className="tx-list">
            {visibleTransactions.map((t) => (
              <TransactionRow key={t.id} t={t} />
            ))}
          </div>

          {!showAll && data.recentTransactions.length > VISIBLE_TRANSACTIONS && (
            <button className="btn press-on-tap" style={{ marginTop: "1rem" }} onClick={() => setShowAll(true)}>
              View all {data.recentTransactions.length} transactions
            </button>
          )}
        </>
      )}
    </>
  );
}

export { TransactionRow, VISIBLE_TRANSACTIONS };

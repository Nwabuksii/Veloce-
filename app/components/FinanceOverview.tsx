"use client";

import { useEffect, useState } from "react";
import { AIcon } from "@/app/components/AdminIcons";

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
    <div className="stat-tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function TransactionRow({ t }: { t: Transaction }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div className="data-row ledger-tx">
      <div style={{ minWidth: 0 }}>
        <div className="row-title">
          {t.courseCode} — {t.blockTitle}
        </div>
        <div className="row-code">
          {t.buyerName} bought from {t.scribeName} · {new Date(t.purchasedAt).toLocaleDateString()}
        </div>
      </div>

      <div className="hide-sm" style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
        {t.discountApplied && <span className="status info">{isMobile ? "FRP" : "Request-discounted"}</span>}
        {t.disputed ? (
          <span className="status danger">Disputed</span>
        ) : t.refunded ? (
          <span className="status danger">Refunded</span>
        ) : t.redeemedWithCoupon ? (
          <span className="status plum">{t.amountPaid === 0 ? "Credit" : `Credit + ₦${t.amountPaid.toLocaleString()}`}</span>
        ) : (
          <span className="status success">Paid</span>
        )}
      </div>

      <div className="row-stat" style={{ minWidth: 92 }}>
        <span className={t.refunded || t.disputed ? "money-neg" : "money-pos"}>
          {t.refunded || t.disputed ? "−" : "+"}₦{t.amountPaid.toLocaleString()}
        </span>
        {t.creditApplied > 0 && <div style={{ fontSize: 11, color: "var(--text-pro)", marginTop: 3 }}>+₦{t.creditApplied.toLocaleString()} credit</div>}
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
      <div className="three-col">
        <StatCard label="Gross revenue" value={`₦${data.grossRevenue.toLocaleString()}`} sub={`${data.transactionCount} transactions total`} />
        <StatCard label="Platform fee" value={`₦${data.platformRevenue.toLocaleString()}`} sub="₦400 for normal sales · ₦300 for request-discounted sales" />
        <StatCard label="Scribe payout" value={`₦${data.scribePool.toLocaleString()}`} sub="₦600 per confirmed sale, split across scribes" />
      </div>

      <div className="section-head">
        <h2 className="panel-title">{AIcon.coin()} Refund credit</h2>
      </div>
      <div className="three-col">
        <StatCard label="Issued" value={`₦${data.creditIssued.toLocaleString()}`} sub="granted across all refunds" />
        <StatCard label="Redeemed" value={`₦${data.creditRedeemed.toLocaleString()}`} sub="applied toward purchases" />
        <StatCard label="Outstanding" value={`₦${data.creditOutstanding.toLocaleString()}`} sub="real money, sitting unspent" />
      </div>

      {children}

      <div className="section-head">
        <h2 className="panel-title">{AIcon.list()} Recent transactions</h2>
      </div>

      {data.recentTransactions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">{AIcon.coin()}</div>
          <h3 className="empty-title">No purchases yet</h3>
          <p className="empty-desc">Sales will show up here as they happen.</p>
        </div>
      ) : (
        <>
          <div className="stack-10">
            {visibleTransactions.map((t) => (
              <TransactionRow key={t.id} t={t} />
            ))}
          </div>

          {!showAll && data.recentTransactions.length > VISIBLE_TRANSACTIONS && (
            <button className="btn btn-ghost" style={{ marginTop: "1rem" }} onClick={() => setShowAll(true)}>
              View all {data.recentTransactions.length} transactions
            </button>
          )}
        </>
      )}
    </>
  );
}

export { TransactionRow, VISIBLE_TRANSACTIONS };

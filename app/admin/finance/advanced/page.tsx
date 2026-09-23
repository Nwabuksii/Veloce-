"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import PageHeader from "@/app/components/PageHeader";
import { SkeletonStatRow, SkeletonList } from "@/app/components/Skeleton";
import { friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import FinanceOverview, { FinanceOverviewData, StatCard, TransactionRow } from "@/app/components/FinanceOverview";

interface EscrowBucket {
  count: number;
  total: number;
  scribePortion: number;
  platformPortion: number;
  recent: FinanceOverviewData["recentTransactions"];
}

interface AdvancedFinanceData extends FinanceOverviewData {
  clearing: EscrowBucket;
  refundReview: EscrowBucket;
  disputedCount: number;
}

function EscrowSection({
  icon,
  title,
  description,
  bucket,
  accentColor,
  emptyText,
}: {
  icon: string;
  title: string;
  description: string;
  bucket: EscrowBucket;
  accentColor: string;
  emptyText: string;
}) {
  return (
    <>
      <h2 style={{ marginTop: "2rem" }}>
        <i className={`fas ${icon}`} style={{ color: accentColor }}></i> {title}
      </h2>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.2rem", maxWidth: 640 }}>{description}</p>

      <div className="stat-row" style={{ marginTop: "0.8rem" }}>
        <StatCard label="Total held" value={`₦${bucket.total.toLocaleString()}`} sub={`${bucket.count} sale${bucket.count === 1 ? "" : "s"}`} />
        <StatCard label="Would go to scribes" value={`₦${bucket.scribePortion.toLocaleString()}`} sub="if resolved as-is" />
        <StatCard label="Would go to platform" value={`₦${bucket.platformPortion.toLocaleString()}`} sub="if resolved as-is" />
      </div>

      {bucket.recent.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", marginTop: "0.8rem", fontSize: "0.85rem" }}>{emptyText}</p>
      ) : (
        <div className="tx-list" style={{ marginTop: "0.8rem" }}>
          {bucket.recent.map((t) => (
            <TransactionRow key={t.id} t={t} />
          ))}
        </div>
      )}
    </>
  );
}

export default function AdminFinanceAdvancedPage() {
  const router = useRouter();
  const [data, setData] = useState<AdvancedFinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

    fetch("/api/admin/finance/advanced")
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

  return (
    <div className="page-wrap">
      <div className="app-container">
        <PageHeader title="Advanced analytics" subtitle="The full financial ledger, plus escrow — money not yet the scribe's or the platform's.">
          <button className="btn" onClick={() => router.push("/admin/finance")}>
            <i className="fas fa-arrow-left"></i> Financial ledger
          </button>
        </PageHeader>

        {loading && (
          <>
            <SkeletonStatRow count={3} />
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
          <FinanceOverview data={data}>
            <EscrowSection
              icon="fa-hourglass-half"
              title="Clearing"
              description="Sales still inside the refund window — no refund requested yet. This money becomes the scribe's and the platform's automatically once the window passes, unless the buyer requests a refund before then."
              bucket={data.clearing}
              accentColor="var(--text-warning)"
              emptyText="Nothing currently clearing."
            />
            <EscrowSection
              icon="fa-user-shield"
              title="Refund review"
              description="Sales on hold because a buyer requested a refund — none of this money belongs to the scribe or the platform yet, and it stays held for as long as it takes to decide. Approving hands the buyer the whole amount back as credit; declining releases it to the scribe and platform right away."
              bucket={data.refundReview}
              accentColor="var(--text-info)"
              emptyText="Nothing currently awaiting a refund decision."
            />

            {data.disputedCount > 0 && (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: "1.5rem" }}>
                {data.disputedCount} purchase{data.disputedCount === 1 ? "" : "s"} excluded above as disputed (bank
                chargeback) — that cash actually left via Paystack, so it isn't credit, clearing, or revenue.
              </p>
            )}
          </FinanceOverview>
        )}
      </div>
    </div>
  );
}

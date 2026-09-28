"use client";

import { ReactElement, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
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
  emptyText,
}: {
  icon: ReactElement;
  title: string;
  description: string;
  bucket: EscrowBucket;
  emptyText: string;
}) {
  return (
    <>
      <div className="section-head">
        <h2 className="panel-title">
          {icon} {title}
        </h2>
        <p className="panel-desc">{description}</p>
      </div>

      <div className="three-col">
        <StatCard label="Total held" value={`₦${bucket.total.toLocaleString()}`} sub={`${bucket.count} sale${bucket.count === 1 ? "" : "s"}`} />
        <StatCard label="Would go to scribes" value={`₦${bucket.scribePortion.toLocaleString()}`} sub="if resolved as-is" />
        <StatCard label="Would go to platform" value={`₦${bucket.platformPortion.toLocaleString()}`} sub="if resolved as-is" />
      </div>

      {bucket.recent.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", marginTop: "0.9rem", fontSize: "0.85rem" }}>{emptyText}</p>
      ) : (
        <div className="stack-10" style={{ marginTop: "0.9rem" }}>
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
      <AdminPageHeader
        section="Deep dive"
        title="Advanced"
        serif="analytics"
        subtitle="The full financial ledger, plus escrow — money not yet the scribe's or the platform's."
      >
        <button className="btn btn-ghost" onClick={() => router.push("/admin/finance")}>
          {AIcon.back()} Financial ledger
        </button>
      </AdminPageHeader>

      {loading && (
        <>
          <SkeletonStatRow count={3} />
          <div style={{ marginTop: "1rem" }}>
            <SkeletonList rows={5} />
          </div>
        </>
      )}

      {error && !loading && <div className="auth-error">{error}</div>}

      {data && (
        <FinanceOverview data={data}>
          <EscrowSection
            icon={AIcon.clock()}
            title="Clearing"
            description="Sales still inside the refund window — no refund requested yet. This money becomes the scribe's and the platform's automatically once the window passes, unless the buyer requests a refund before then."
            bucket={data.clearing}
            emptyText="Nothing currently clearing."
          />
          <EscrowSection
            icon={AIcon.shield()}
            title="Refund review"
            description="Sales on hold because a buyer requested a refund — none of this money belongs to the scribe or the platform yet, and it stays held for as long as it takes to decide. Approving hands the buyer the whole amount back as credit; declining releases it to the scribe and platform right away."
            bucket={data.refundReview}
            emptyText="Nothing currently awaiting a refund decision."
          />

          {data.disputedCount > 0 && (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: "1.5rem" }}>
              {data.disputedCount} purchase{data.disputedCount === 1 ? "" : "s"} excluded above as disputed (bank chargeback) — that cash actually left via Paystack, so it isn&apos;t credit, clearing, or revenue.
            </p>
          )}
        </FinanceOverview>
      )}
    </div>
  );
}

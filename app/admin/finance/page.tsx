"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
import { SkeletonStatRow, SkeletonList } from "@/app/components/Skeleton";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import ExportButton from "@/app/components/ExportButton";
import FinanceOverview, { FinanceOverviewData } from "@/app/components/FinanceOverview";

export default function AdminFinancePage() {
  const router = useRouter();
  const [data, setData] = useState<FinanceOverviewData | null>(null);
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

    // Clear the "unseen disputes" badge — this admin has now opened the page.
    apiFetch("/api/admin/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "ledger" }),
    }).catch(() => {});

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

  return (
    <div className="page-wrap">
      <AdminPageHeader section="Ledger" title="Financial" serif="ledger" subtitle="Payments, payouts and refunds across the platform.">
        <ExportButton url="/api/admin/finance/export" />
        <button className="btn btn-ghost" onClick={() => router.push("/admin/finance/analysis")}>
          {AIcon.trend()} Revenue analysis
        </button>
        <button className="btn btn-ghost" onClick={() => router.push("/admin/finance/advanced")}>
          {AIcon.trend()} Advanced analytics
        </button>
        <button className="btn btn-ghost" onClick={() => router.push("/admin")}>
          {AIcon.back()} Admin
        </button>
      </AdminPageHeader>

      {loading && (
        <>
          <SkeletonStatRow count={3} />
          <div className="section-head">
            <h2 className="panel-title">{AIcon.list()} Recent transactions</h2>
          </div>
          <SkeletonList rows={5} />
        </>
      )}

      {error && !loading && <div className="auth-error">{error}</div>}

      {data && <FinanceOverview data={data} />}
    </div>
  );
}

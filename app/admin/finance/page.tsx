"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import PageHeader from "@/app/components/PageHeader";
import { SkeletonStatRow, SkeletonList } from "@/app/components/Skeleton";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";
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
      <div className="app-container">
        <PageHeader title="Financial ledger" subtitle="Payments, payouts and refunds across the platform.">
          <button className="btn" onClick={() => router.push("/admin/finance/advanced")}>
            <i className="fas fa-chart-line"></i> Advanced analytics
          </button>
          <button className="btn" onClick={() => router.push("/admin")}>
            <i className="fas fa-arrow-left"></i> Admin
          </button>
        </PageHeader>

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

        {data && <FinanceOverview data={data} />}
      </div>
    </div>
  );
}

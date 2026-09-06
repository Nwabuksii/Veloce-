"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { friendlyErrorMessage } from "@/lib/api-client";

interface Transaction {
  id: string;
  buyerName: string;
  scribeName: string;
  blockTitle: string;
  courseCode: string;
  amountPaid: number;
  discountApplied: boolean;
  purchasedAt: string;
}

interface FinanceData {
  grossRevenue: number;
  platformRevenue: number;
  scribePool: number;
  transactionCount: number;
  scribeSharePercent: number;
  platformSharePercent: number;
  recentTransactions: Transaction[];
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "white", border: "1px solid #e1e8f0", borderRadius: "1rem", padding: "1.2rem", flex: "1 1 200px" }}>
      <div style={{ fontSize: "0.8rem", color: "#5e7188", marginBottom: "0.4rem" }}>{label}</div>
      <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "#0b1e33" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.75rem", color: "#5e7188", marginTop: "0.2rem" }}>{sub}</div>}
    </div>
  );
}

export default function AdminFinancePage() {
  const router = useRouter();
  const [data, setData] = useState<FinanceData | null>(null);
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

    fetch("/api/admin/finance")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load financial data");
        setData(json);
      })
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [router]);

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

        {loading && <p style={{ color: "#5e7188", marginTop: "1rem" }}>Loading...</p>}
        {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}

        {data && (
          <>
            <div style={{ display: "flex", gap: "1rem", marginTop: "1.2rem", flexWrap: "wrap" }}>
              <StatCard label="Gross revenue" value={`₦${data.grossRevenue.toLocaleString()}`} sub={`${data.transactionCount} transactions`} />
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

            <h2 style={{ marginTop: "2rem" }}>
              <i className="fas fa-receipt" style={{ color: "#2a7de1" }}></i> Recent transactions
            </h2>

            {data.recentTransactions.length === 0 ? (
              <p style={{ color: "#5e7188", marginTop: "1rem" }}>No purchases yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "1rem" }}>
                {data.recentTransactions.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      background: "white",
                      border: "1px solid #e1e8f0",
                      borderRadius: "0.9rem",
                      padding: "0.8rem 1rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                      fontSize: "0.85rem",
                    }}
                  >
                    <div>
                      <strong>
                        {t.courseCode} — {t.blockTitle}
                      </strong>
                      <div style={{ color: "#5e7188", fontSize: "0.8rem" }}>
                        {t.buyerName} bought from {t.scribeName}
                        {t.discountApplied && (
                          <span style={{ color: "#1b7e4a" }}> · discount applied</span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 600 }}>₦{t.amountPaid.toLocaleString()}</div>
                      <div style={{ color: "#5e7188", fontSize: "0.75rem" }}>
                        {new Date(t.purchasedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

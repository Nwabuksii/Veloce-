"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { SkeletonList } from "@/app/components/Skeleton";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";

interface BlockPerf {
  blockId: string;
  blockTitle: string;
  courseCode: string;
  salesCount: number;
  earnings: number;
  pending: number;
  avgRating: number | null;
  reviewCount: number;
  status: string;
}

interface Analytics {
  trustLevel: string;
  trustLabel: string;
  nextTier: { label: string; salesNeeded: number; ratingNeeded: number | null } | null;
  hasRejectedNote: boolean;
  totalSales: number;
  salesLast30: number;
  salesPrev30: number;
  avgRating: number | null;
  totalReviews: number;
  totalEarnings: number;
  pendingEarnings: number;
  followerCount: number;
  byBlock: BlockPerf[];
}

const TIER_COLOR: Record<string, string> = {
  NEW: "var(--text-secondary)",
  RISING: "var(--text-info)",
  TRUSTED: "var(--text-success)",
  ELITE: "var(--star)",
};

export default function ScribeAnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
      return;
    }
    apiFetch("/api/scribe/analytics")
      .then(setData)
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [router]);

  const salesTrendDelta = data ? data.salesLast30 - data.salesPrev30 : 0;

  return (
    <div className="page-wrap">
      <div className="app-container">
        <div className="top-bar">
          <div className="logo" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Logo size={34} />
            <div>
              <h1>
                Veloce
              </h1>
              <div className="logo-sub">Your analytics</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="btn" onClick={() => router.push("/scribe")}>
              <i className="fas fa-arrow-left"></i> Scribe hub
            </button>
            <ProfileMenu />
          </div>
        </div>

        {loading && <SkeletonList rows={4} />}
        {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}

        {data && (
          <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "1.8rem" }}>
            {/* --- Trust score hero --- */}
            <div className="stat-hero" style={{ borderTopColor: TIER_COLOR[data.trustLevel] }}>
              <div className="stat-label">Your scribe score</div>
              <div className="stat-value">{data.trustLabel}</div>
              <div className="stat-sub">
                {data.nextTier ? (
                  <>
                    <i className="fas fa-arrow-trend-up"></i>{" "}
                    {data.nextTier.salesNeeded > 0 && `${data.nextTier.salesNeeded} more sale${data.nextTier.salesNeeded === 1 ? "" : "s"}`}
                    {data.nextTier.salesNeeded > 0 && data.nextTier.ratingNeeded && " and "}
                    {data.nextTier.ratingNeeded && `a ${data.nextTier.ratingNeeded.toFixed(1)}+ average rating`}
                    {data.nextTier.salesNeeded === 0 && !data.nextTier.ratingNeeded
                      ? `You qualify for ${data.nextTier.label} — it'll apply automatically.`
                      : ` to reach ${data.nextTier.label}`}
                  </>
                ) : (
                  <>
                    <i className="fas fa-crown"></i> You've reached the top tier
                  </>
                )}
              </div>
              {data.hasRejectedNote && (
                <div className="stat-sub" style={{ color: "var(--text-warning)" }}>
                  <i className="fas fa-triangle-exclamation"></i> A rejected note is capping you below Trusted/Elite right now
                </div>
              )}
            </div>

            {/* --- Secondary stats --- */}
            <div className="stat-row">
              <div className="stat-card">
                <div className="stat-label">Total sales</div>
                <div className="stat-value">{data.totalSales}</div>
                <div className="stat-sub">
                  {salesTrendDelta === 0 ? (
                    "same as the 30 days before"
                  ) : salesTrendDelta > 0 ? (
                    <span style={{ color: "var(--text-success)" }}>
                      <i className="fas fa-arrow-up"></i> {salesTrendDelta} more than the previous 30 days
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-danger)" }}>
                      <i className="fas fa-arrow-down"></i> {Math.abs(salesTrendDelta)} fewer than the previous 30 days
                    </span>
                  )}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Average rating</div>
                <div className="stat-value">{data.avgRating !== null ? data.avgRating.toFixed(1) : "—"}</div>
                <div className="stat-sub">from {data.totalReviews} review{data.totalReviews === 1 ? "" : "s"}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Followers</div>
                <div className="stat-value">{data.followerCount}</div>
                <div className="stat-sub">students following you</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Earnings</div>
                <div className="stat-value">₦{data.totalEarnings.toLocaleString()}</div>
                <div className="stat-sub">
                  {data.pendingEarnings > 0 ? `+₦${data.pendingEarnings.toLocaleString()} pending` : "confirmed"}
                </div>
              </div>
            </div>

            {/* --- Per-block performance --- */}
            <div>
              <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
                <i className="fas fa-chart-simple" style={{ color: "var(--accent)" }}></i> Per-block performance
              </h2>
              {data.byBlock.length === 0 ? (
                <p style={{ color: "var(--text-secondary)" }}>No sales yet — once you make a sale, it'll show up here.</p>
              ) : (
                <div className="ledger-list">
                  {data.byBlock.map((b) => (
                    <div key={b.blockId} className="ledger-row">
                      <div className="ledger-row-head">
                        <span className="ledger-row-title">
                          <span className="seal mono" style={{ marginRight: "0.5rem" }}>{b.courseCode}</span>
                          {b.blockTitle}
                        </span>
                        <span className="price-tag">₦{b.earnings.toLocaleString()}</span>
                      </div>
                      <div className="ledger-row-meta">
                        {b.salesCount} sale{b.salesCount === 1 ? "" : "s"}
                        {b.avgRating !== null && ` · ${b.avgRating.toFixed(1)}★ (${b.reviewCount})`}
                        {b.pending > 0 && ` · ₦${b.pending.toLocaleString()} pending`}
                      </div>
                      {b.status === "FLAGGED" && <span className="stamp stamp-warning">Flagged for review</span>}
                      {b.status === "REJECTED" && <span className="stamp stamp-danger">Rejected</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

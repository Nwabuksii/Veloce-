"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import PageHeader from "@/app/components/PageHeader";
import { SkeletonList } from "@/app/components/Skeleton";
import { Icon } from "@/app/components/icons";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import ExportButton from "@/app/components/ExportButton";

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
  monthlySales: Array<{ label: string; value: number }>;
  monthlyEarnings: Array<{ label: string; value: number }>;
}

const naira = (n: number) => `₦${n.toLocaleString()}`;

function TrendChart({
  title,
  description,
  data,
  formatValue,
}: {
  title: string;
  description: string;
  data: Array<{ label: string; value: number }>;
  formatValue: (value: number) => string;
}) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <div className="panel">
      <h2 className="panel-title">{Icon.trend()} {title}</h2>
      <p className="panel-desc">{description}</p>
      <div className="chart-wrap" aria-label={title}>
        {data.map((item) => (
          <div className="chart-col" key={item.label}>
            <div className="chart-val">{formatValue(item.value)}</div>
            <div className="chart-bar" style={{ height: `${Math.max(4, (item.value / max) * 130)}px` }} />
            <div className="chart-label">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
    apiFetch("/api/scribe/analytics", { cache: "no-store" })
      .then(setData)
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [router]);

  const salesTrendDelta = data ? data.salesLast30 - data.salesPrev30 : 0;
  const topSales = data ? Math.max(1, ...data.byBlock.map((b) => b.salesCount)) : 1;

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Scribe · Insights"
        title="Your"
        accent="analytics"
        subtitle="How your notes are performing — your scribe score, sales trend and top performers."
      >
        <ExportButton url="/api/scribe/export" />
        <button className="btn btn-ghost" onClick={() => router.push("/scribe")}>
          {Icon.back()} Scribe Studio
        </button>
      </PageHeader>

      {loading && <SkeletonList rows={4} />}
      {error && <div className="auth-error">{error}</div>}

      {data && (
        <>
          {/* --- Scribe score --- */}
          <div className="panel balance-hero mb-24">
            <div className="flex-between">
              <div>
                <div className="form-label">Your scribe score</div>
                <div className="balance-num">{data.trustLabel}</div>
              </div>
              <span className={`chip tier-${data.trustLevel.toLowerCase()}`}>
                {Icon.shield()} {data.trustLevel.charAt(0) + data.trustLevel.slice(1).toLowerCase()}
              </span>
            </div>

            <p className="panel-desc" style={{ marginTop: 14, marginBottom: 0 }}>
              {data.nextTier ? (
                <>
                  {data.nextTier.salesNeeded > 0 &&
                    `${data.nextTier.salesNeeded} more sale${data.nextTier.salesNeeded === 1 ? "" : "s"}`}
                  {data.nextTier.salesNeeded > 0 && data.nextTier.ratingNeeded && " and "}
                  {data.nextTier.ratingNeeded && `a ${data.nextTier.ratingNeeded.toFixed(1)}+ average rating`}
                  {data.nextTier.salesNeeded === 0 && !data.nextTier.ratingNeeded
                    ? `You qualify for ${data.nextTier.label} — it'll apply automatically.`
                    : ` to reach ${data.nextTier.label}`}
                </>
              ) : (
                "You've reached the top tier."
              )}
            </p>

            {data.hasRejectedNote && (
              <div className="callout is-warn" style={{ marginTop: 14 }}>
                {Icon.warn()}
                <div>A rejected note is capping you below Trusted/Elite right now.</div>
              </div>
            )}
          </div>

          {/* --- Stats --- */}
          <div className="three-col mb-24">
            <div className="stat-card">
              <div className="label">Total sales</div>
              <div className="value">{data.totalSales}</div>
              {salesTrendDelta === 0 ? (
                <span className="delta flat">{Icon.trend()} same as previous 30 days</span>
              ) : salesTrendDelta > 0 ? (
                <span className="delta">
                  {Icon.trend()} +{salesTrendDelta} vs previous 30 days
                </span>
              ) : (
                <span className="delta down">
                  {Icon.trend()} −{Math.abs(salesTrendDelta)} vs previous 30 days
                </span>
              )}
            </div>
            <div className="stat-card">
              <div className="label">Average rating</div>
              <div className="value">{data.avgRating !== null ? data.avgRating.toFixed(1) : "—"}</div>
              <span className="delta flat">
                {Icon.star()} {data.totalReviews} review{data.totalReviews === 1 ? "" : "s"}
              </span>
            </div>
            <div className="stat-card">
              <div className="label">Followers</div>
              <div className="value">{data.followerCount}</div>
              <span className="delta flat">{Icon.users()} students following you</span>
            </div>
            <div className="stat-card">
              <div className="label">Earnings</div>
              <div className="value">{naira(data.totalEarnings)}</div>
              {data.pendingEarnings > 0 ? (
                <span className="delta warn">{Icon.hourglass()} +{naira(data.pendingEarnings)} pending</span>
              ) : (
                <span className="delta">{Icon.check()} confirmed</span>
              )}
            </div>
          </div>

          {/* --- Six-month trends --- */}
          <div className="two-col mb-24">
            <TrendChart
              title="Sales trend"
              description="Notes sold over the last six months."
              data={data.monthlySales}
              formatValue={(value) => value.toLocaleString()}
            />
            <TrendChart
              title="Earnings trend"
              description="Confirmed scribe earnings over the last six months."
              data={data.monthlyEarnings}
              formatValue={naira}
            />
          </div>

          {/* --- Per-block performance --- */}
          <h2 className="panel-title section-title">{Icon.book()} Per-block performance</h2>
          {data.byBlock.length === 0 ? (
            <div className="panel">
              <div className="empty-state">No sales yet — once you make a sale, it&apos;ll show up here.</div>
            </div>
          ) : (
            <div>
              {data.byBlock.map((b) => {
                const pct = Math.round((b.salesCount / topSales) * 100);
                return (
                  <div key={b.blockId} className="panel perf-card">
                    <div className="flex-between perf-head">
                      <div style={{ minWidth: 0 }}>
                        <div className="code-label">{b.courseCode}</div>
                        <div className="perf-title">{b.blockTitle}</div>
                        <div className="perf-meta">
                          {b.avgRating !== null ? `${b.avgRating.toFixed(1)}★ (${b.reviewCount})` : "No ratings yet"}
                          {b.pending > 0 && ` · ${naira(b.pending)} pending`}
                        </div>
                      </div>
                      <div className="perf-stats">
                        <div className="perf-stat">
                          <strong>{b.salesCount}</strong>Sold
                        </div>
                        <div className="perf-stat">
                          <strong>{naira(b.earnings)}</strong>Earned
                        </div>
                      </div>
                    </div>
                    <div className="poll-track">
                      <div className="poll-fill" style={{ width: `${pct}%` }} />
                    </div>
                    {(b.status === "FLAGGED" || b.status === "REJECTED") && (
                      <div style={{ marginTop: 10 }}>
                        <span className={`status ${b.status === "FLAGGED" ? "review" : "rejected"}`}>
                          {b.status === "FLAGGED" ? "Flagged for review" : "Rejected"}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

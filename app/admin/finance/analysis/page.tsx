"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
import { SkeletonStatRow, SkeletonList } from "@/app/components/Skeleton";
import LineChart from "@/app/components/LineChart";
import { StatCard } from "@/app/components/FinanceOverview";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import type { FinanceAnalysis, SourceRow } from "@/lib/finance-analysis";
import "./analysis.css";
import "../finance-page.css";

const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;

function Sources({ title, rows, unit }: { title: string; rows: SourceRow[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.platform));
  return (
    <div className="panel">
      <h3 className="panel-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="panel-desc" style={{ margin: 0 }}>No confirmed sales yet.</p>
      ) : (
        <div className="fa-sources">
          {rows.map((r) => (
            <div key={`${r.name}-${r.detail ?? ""}`} className="fa-source">
              <div className="fa-source-top">
                <span className="fa-source-name">{r.name}{r.detail ? <small> · {r.detail}</small> : null}</span>
                <strong>{naira(r.platform)}</strong>
              </div>
              <div className="fa-source-bar"><span style={{ width: `${Math.max(3, (r.platform / max) * 100)}%` }} /></div>
              <small>{r.sales} {unit}{r.sales === 1 ? "" : "s"}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FinanceAnalysisPage() {
  const router = useRouter();
  const [data, setData] = useState<FinanceAnalysis | null>(null);
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
    apiFetch<FinanceAnalysis>("/api/admin/finance/analysis")
      .then(setData)
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [router]);

  const labels = data ? data.months.map((m) => m.label) : [];
  const col = (pick: (m: FinanceAnalysis["months"][number]) => number) => (data ? data.months.map(pick) : []);

  // Forecast chart: history, then dashed lines from this month to "Next" (low / expected / high).
  const nextLabels = [...labels, "Next"];
  const history = col((m) => m.platform);
  const lastIdx = history.length - 1;
  const fan = (target: number): (number | null)[] => [...history.map((_, i) => (i === lastIdx ? history[i] : null)), target];

  return (
    <div className="page-wrap finance-page">
      <AdminPageHeader
        section="Deep dive"
        title="Revenue"
        serif="analysis"
        subtitle="Month by month: what you have earned, what is still to come, where money leaks, and where it all comes from."
      >
        <button className="btn btn-ghost" onClick={() => router.push("/admin/finance/advanced")}>
          {AIcon.back()} Advanced analytics
        </button>
        <button className="btn btn-ghost" onClick={() => router.push("/admin/finance")}>
          {AIcon.back()} Financial ledger
        </button>
      </AdminPageHeader>

      {loading && (
        <>
          <SkeletonStatRow count={4} />
          <div style={{ marginTop: "1rem" }}>
            <SkeletonList rows={4} />
          </div>
        </>
      )}
      {error && !loading && <div className="auth-error">{error}</div>}

      {data && (
        <>
          <p className="panel-desc">
            The split on every sale: the scribe gets a fixed ₦600 and the platform keeps the rest (total paid − ₦600). Money only counts as revenue once the refund window has passed.
          </p>

          <div className="fa-cards mb-24">
            <StatCard
              label="Platform revenue (confirmed)"
              value={naira(data.summary.confirmedPlatform)}
              sub={`${naira(data.summary.thisMonth)} this month${data.summary.monthChangePercent === null ? "" : ` (${data.summary.monthChangePercent > 0 ? "+" : ""}${data.summary.monthChangePercent}% vs last month)`}`}
            />
            <StatCard
              label="Still to come"
              value={naira(data.pipeline.platformExpected)}
              sub={`expected of ${naira(data.pipeline.platformIfAllClears)} still clearing`}
            />
            <StatCard label="At risk right now" value={naira(data.pipeline.platformAtRisk)} sub={`${data.pipeline.review.count} sale${data.pipeline.review.count === 1 ? "" : "s"} under refund review`} />
            <StatCard
              label="Lost to refunds & chargebacks"
              value={naira(data.losses.refunded.lostPlatform + data.losses.disputed.lostPlatform)}
              sub={`platform cut on ${data.losses.refunded.count + data.losses.disputed.count} sales · ${data.summary.refundRatePercent}% rate`}
            />
          </div>

          <div className="panel mb-24">
            <h2 className="panel-title">{AIcon.trend()} Monthly revenue</h2>
            <p className="panel-desc">What the platform earned and what scribes earned each month, against the total value of sales made. A gap between "Sales value" and the two earnings lines is money still clearing, refunded or charged back.</p>
            <LineChart
              labels={labels}
              yPrefix="₦"
              format={naira}
              emptyText="No sales in the last 12 months yet."
              series={[
                { name: "Platform revenue", color: "var(--gold)", values: col((m) => m.platform) },
                { name: "Scribe earnings", color: "var(--text-success)", values: col((m) => m.scribe) },
                { name: "Sales value", color: "var(--text-info)", values: col((m) => m.gross) },
              ]}
            />
          </div>

          <div className="panel mb-24">
            <h2 className="panel-title">{AIcon.spark()} Where next month could land</h2>
            <p className="panel-desc">
              {data.forecast.basedOnMonths === 0
                ? "Not enough history yet. This fills in after your first full month of sales."
                : `Built from your last ${data.forecast.basedOnMonths} full month${data.forecast.basedOnMonths === 1 ? "" : "s"} of platform revenue (trend ${data.forecast.growthPercent > 0 ? "+" : ""}${data.forecast.growthPercent}%). Low and high are your worst and best of those months. This is an estimate, not a promise.`}
            </p>
            <LineChart
              labels={nextLabels}
              yPrefix="₦"
              format={naira}
              emptyText="No history to project from yet."
              series={[
                { name: "Platform revenue", color: "var(--gold)", values: [...history, null] },
                { name: `Expected ${naira(data.forecast.base)}`, color: "var(--text-info)", dashed: true, values: fan(data.forecast.base) },
                { name: `High ${naira(data.forecast.high)}`, color: "var(--text-success)", dashed: true, values: fan(data.forecast.high) },
                { name: `Low ${naira(data.forecast.low)}`, color: "var(--text-danger)", dashed: true, values: fan(data.forecast.low) },
              ]}
            />
          </div>

          <div className="section-head">
            <h2 className="panel-title">{AIcon.clock()} Potential gain: money on its way</h2>
          </div>
          <div className="three-col mb-24">
            <StatCard label="Clearing" value={naira(data.pipeline.clearing.platform)} sub={`platform cut on ${data.pipeline.clearing.count} sale${data.pipeline.clearing.count === 1 ? "" : "s"} inside the refund window (${naira(data.pipeline.clearing.total)} total)`} />
            <StatCard label="Refund review" value={naira(data.pipeline.review.platform)} sub={`platform cut on ${data.pipeline.review.count} sale${data.pipeline.review.count === 1 ? "" : "s"} waiting for a decision (${naira(data.pipeline.review.total)} total)`} />
            <StatCard label="Likely to clear" value={naira(data.pipeline.platformExpected)} sub={`after your usual ${data.summary.refundRatePercent}% refund and chargeback rate`} />
          </div>

          <div className="panel mb-24">
            <h2 className="panel-title">{AIcon.warn()} Losses over time</h2>
            <p className="panel-desc">The value of sales refunded back to buyers as credit, and sales charged back through the bank, by the month the sale was made.</p>
            <LineChart
              labels={labels}
              yPrefix="₦"
              format={naira}
              emptyText="No refunds or chargebacks in the last 12 months. Good."
              series={[
                { name: "Refunded as credit", color: "var(--text-danger)", values: col((m) => m.refundedValue) },
                { name: "Chargebacks", color: "var(--gold)", values: col((m) => m.disputedValue) },
              ]}
            />
          </div>

          <div className="section-head">
            <h2 className="panel-title">{AIcon.warn()} Where money is lost or leaks</h2>
          </div>
          <div className="fa-cards mb-24">
            <StatCard label="Refunded" value={naira(data.losses.refunded.total)} sub={`${data.losses.refunded.count} sale${data.losses.refunded.count === 1 ? "" : "s"}. ${data.losses.refunded.note}`} />
            <StatCard label="Chargebacks" value={naira(data.losses.disputed.total)} sub={`${data.losses.disputed.count} sale${data.losses.disputed.count === 1 ? "" : "s"}. ${data.losses.disputed.note}`} />
            <StatCard label="Request discounts" value={naira(data.losses.discount.amount)} sub={`${data.losses.discount.sales} sale${data.losses.discount.sales === 1 ? "" : "s"}. ${data.losses.discount.note}`} />
            <StatCard label="Credit owed to buyers" value={naira(data.losses.creditOutstanding)} sub="Real money you hold that buyers can spend. Not your revenue." />
          </div>

          <div className="section-head">
            <h2 className="panel-title">{AIcon.chart()} Where revenue comes from</h2>
            <p className="panel-desc">Platform cut from confirmed sales. Paid in cash {naira(data.sources.cash)} · paid with credit {naira(data.sources.credit)}.</p>
          </div>
          <div className="fa-three mb-24">
            <Sources title="Top courses" rows={data.sources.courses} unit="sale" />
            <Sources title="Top blocks" rows={data.sources.blocks} unit="sale" />
            <Sources title="Top scribes" rows={data.sources.scribes} unit="sale" />
          </div>

          <div className="panel mb-24">
            <h2 className="panel-title">{AIcon.list()} Month by month</h2>
            <div className="fa-table-wrap">
              <table className="fa-table">
                <thead>
                  <tr>
                    <th>Month</th><th>Sales</th><th>Sales value</th><th>Platform</th><th>Scribes</th><th>Clearing</th><th>Refunded</th><th>Chargebacks</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.months].reverse().map((m) => (
                    <tr key={`${m.year}-${m.label}`}>
                      <td>{m.label} {m.year}</td>
                      <td>{m.sales}</td>
                      <td>{naira(m.gross)}</td>
                      <td>{naira(m.platform)}</td>
                      <td>{naira(m.scribe)}</td>
                      <td>{naira(m.pendingPlatform)}</td>
                      <td>{naira(m.refundedValue)}</td>
                      <td>{naira(m.disputedValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

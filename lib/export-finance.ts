import { prisma } from "@/lib/prisma";
import { computePlatformCut, computeScribeCut, effectivePrice, EARNINGS_HOLD_MINUTES } from "@/lib/pricing";
import { getAvailableBalance, saleStatus } from "@/lib/withdrawal";
import { getFinanceData } from "@/lib/finance";
import { getFinanceAnalysis } from "@/lib/finance-analysis";
import { addChartsSheet, addSummarySheet, addTableSheet, newWorkbook } from "@/lib/xlsx-export";
import { renderChart } from "@/lib/xlsx-charts";

// Financial reports as Excel workbooks: one Summary sheet, a few table
// sheets you can sort / filter / reconcile in, and a Charts sheet.
//
// Scribe report follows the same privacy rule as the Earnings page: final
// figures per block / note only — never buyer identity, never a per-purchase
// breakdown, never the split percentage.

const MONTHS = 12;
const LEDGER_CAP = 10_000; // keeps the admin ledger sheet a sane size

const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
const monthLabel = (d: Date) => d.toLocaleString("en-GB", { month: "short", year: "numeric" });

function lastMonths(count: number): { key: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return { key: monthKey(d), label: monthLabel(d) };
  });
}

// ───────────────────────── Scribe ─────────────────────────

export async function buildScribeReport(scribeId: string, fullName: string) {
  const holdCutoff = new Date(Date.now() - EARNINGS_HOLD_MINUTES * 60 * 1000);
  const now = Date.now();
  const d30 = new Date(now - 30 * 86_400_000);
  const d60 = new Date(now - 60 * 86_400_000);

  const [notes, payouts, followers, available] = await Promise.all([
    prisma.note.findMany({
      where: { scribeId },
      orderBy: { createdAt: "desc" },
      include: {
        block: { select: { id: true, title: true, course: { select: { code: true } } } },
        reviews: { select: { rating: true } },
        purchases: {
          where: { refundedAt: null },
          select: { amountPaid: true, creditApplied: true, purchasedAt: true, reports: { where: { type: "REFUND" }, select: { status: true } } },
        },
      },
    }),
    prisma.payout.findMany({
      where: { scribeId },
      orderBy: { requestedAt: "desc" },
      select: { requestedAt: true, amount: true, status: true, paidAt: true },
    }),
    prisma.follow.count({ where: { scribeId } }),
    getAvailableBalance(scribeId),
  ]);

  const months = lastMonths(MONTHS);
  const monthIndex = new Map(months.map((m, i) => [m.key, i]));
  const monthly = months.map((m) => ({ month: m.label, sales: 0, earned: 0, pending: 0 }));

  let earned = 0, clearing = 0, inReview = 0;
  let confirmedSales = 0, totalSales = 0, salesLast30 = 0, salesPrev30 = 0;
  const ratings: number[] = [];

  type BlockAgg = { course: string; block: string; sales: number; earned: number; pending: number; review: number; ratings: number[] };
  const byBlock = new Map<string, BlockAgg>();

  const noteRows = notes.map((n) => {
    let nEarned = 0, nPending = 0, nReview = 0, nConfirmed = 0;
    const nRatings = n.reviews.map((r) => r.rating);
    ratings.push(...nRatings);

    for (const p of n.purchases) {
      const cut = computeScribeCut(effectivePrice(p));
      const status = saleStatus(p, holdCutoff);
      totalSales += 1;
      if (p.purchasedAt >= d30) salesLast30 += 1;
      else if (p.purchasedAt >= d60) salesPrev30 += 1;

      const mi = monthIndex.get(monthKey(p.purchasedAt));
      if (mi !== undefined) monthly[mi].sales += 1;

      if (status === "confirmed") {
        nEarned += cut; nConfirmed += 1;
        if (mi !== undefined) monthly[mi].earned += cut;
      } else if (status === "clearing") {
        nPending += cut;
        if (mi !== undefined) monthly[mi].pending += cut;
      } else {
        nReview += cut;
        if (mi !== undefined) monthly[mi].pending += cut;
      }
    }
    earned += nEarned; clearing += nPending; inReview += nReview; confirmedSales += nConfirmed;

    const agg = byBlock.get(n.block.id) ?? { course: n.block.course.code, block: n.block.title, sales: 0, earned: 0, pending: 0, review: 0, ratings: [] };
    agg.sales += n.purchases.length; agg.earned += nEarned; agg.pending += nPending; agg.review += nReview; agg.ratings.push(...nRatings);
    byBlock.set(n.block.id, agg);

    return {
      course: n.block.course.code,
      block: n.block.title,
      uploaded: n.createdAt,
      status: n.status,
      sales: n.purchases.length,
      earned: nEarned,
      pending: nPending,
      review: nReview,
      rating: nRatings.length ? nRatings.reduce((a, b) => a + b, 0) / nRatings.length : null,
      reviews: nRatings.length,
    };
  });

  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const changePct = salesPrev30 > 0 ? Math.round(((salesLast30 - salesPrev30) / salesPrev30) * 1000) / 10 : null;
  const paidOut = payouts.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount, 0);

  const wb = newWorkbook();
  addSummarySheet(wb, "Summary", `Earnings report — ${fullName}`, [
    { label: "Earned (confirmed)", value: earned, format: "naira" },
    { label: "Pending (still in refund window)", value: clearing, format: "naira" },
    { label: "Waiting on admin (refund requested)", value: inReview, format: "naira" },
    { label: "Available to withdraw", value: available, format: "naira" },
    { label: "Paid out so far", value: paidOut, format: "naira" },
    { label: "Total sales", value: totalSales, format: "int" },
    { label: "Confirmed sales", value: confirmedSales, format: "int" },
    { label: "Sales in the last 30 days", value: salesLast30, format: "int" },
    { label: "Sales in the 30 days before that", value: salesPrev30, format: "int" },
    { label: "Change in sales", value: changePct, format: "percent" },
    { label: "Average rating", value: avgRating, format: "rating" },
    { label: "Reviews", value: ratings.length, format: "int" },
    { label: "Followers", value: followers, format: "int" },
  ]);

  const blockRows = [...byBlock.values()]
    .sort((a, b) => b.earned - a.earned)
    .map((b) => ({
      course: b.course, block: b.block, sales: b.sales, earned: b.earned, pending: b.pending, review: b.review,
      rating: b.ratings.length ? b.ratings.reduce((x, y) => x + y, 0) / b.ratings.length : null, reviews: b.ratings.length,
    }));

  addTableSheet(wb, {
    name: "By block",
    columns: [
      { header: "Course", key: "course" },
      { header: "Block", key: "block", width: 40 },
      { header: "Sales", key: "sales", format: "int" },
      { header: "Earned", key: "earned", format: "naira" },
      { header: "Pending", key: "pending", format: "naira" },
      { header: "Waiting on admin", key: "review", format: "naira" },
      { header: "Avg rating", key: "rating", format: "rating" },
      { header: "Reviews", key: "reviews", format: "int" },
    ],
    rows: blockRows,
  });

  addTableSheet(wb, {
    name: "By note",
    columns: [
      { header: "Course", key: "course" },
      { header: "Block", key: "block", width: 40 },
      { header: "Uploaded", key: "uploaded", format: "date" },
      { header: "Status", key: "status" },
      { header: "Sales", key: "sales", format: "int" },
      { header: "Earned", key: "earned", format: "naira" },
      { header: "Pending", key: "pending", format: "naira" },
      { header: "Waiting on admin", key: "review", format: "naira" },
      { header: "Avg rating", key: "rating", format: "rating" },
      { header: "Reviews", key: "reviews", format: "int" },
    ],
    rows: noteRows,
  });

  addTableSheet(wb, {
    name: "Monthly",
    columns: [
      { header: "Month", key: "month" },
      { header: "Sales", key: "sales", format: "int" },
      { header: "Earned", key: "earned", format: "naira" },
      { header: "Pending", key: "pending", format: "naira" },
    ],
    rows: monthly,
  });

  addTableSheet(wb, {
    name: "Payouts",
    columns: [
      { header: "Requested", key: "requested", format: "date" },
      { header: "Amount", key: "amount", format: "naira" },
      { header: "Status", key: "status" },
      { header: "Paid on", key: "paid", format: "date" },
    ],
    rows: payouts.map((p) => ({ requested: p.requestedAt, amount: p.amount, status: p.status, paid: p.paidAt })),
  });

  addChartsSheet(wb, [
    renderChart({ title: "Earnings per month (confirmed)", kind: "bar", money: true, labels: monthly.map((m) => m.month), series: [{ name: "Earned", values: monthly.map((m) => m.earned), color: "#16a34a" }] }),
    renderChart({ title: "Sales per month", kind: "line", labels: monthly.map((m) => m.month), series: [{ name: "Sales", values: monthly.map((m) => m.sales), color: "#2563eb" }] }),
  ]);

  return wb;
}

// ───────────────────────── Admin ─────────────────────────

export async function buildAdminReport(universityId: string, universityName: string) {
  const holdCutoff = new Date(Date.now() - EARNINGS_HOLD_MINUTES * 60 * 1000);

  // Same two sources the finance pages use, so the file can never disagree with the screen.
  const [finance, analysis, purchases] = await Promise.all([
    getFinanceData(universityId),
    getFinanceAnalysis(universityId),
    prisma.purchase.findMany({
      where: { block: { course: { department: { universityId } } } },
      orderBy: { purchasedAt: "desc" },
      take: LEDGER_CAP,
      include: {
        block: { select: { title: true, course: { select: { code: true } } } },
        buyer: { select: { fullName: true } },
        note: { select: { scribe: { select: { fullName: true } } } },
        reports: { where: { type: "REFUND" }, select: { status: true } },
      },
    }),
  ]);

  const wb = newWorkbook();
  const s = analysis.summary;

  addSummarySheet(wb, "Summary", `Financial report — ${universityName}`, [
    { label: "Gross revenue", value: finance.grossRevenue, format: "naira" },
    { label: "Platform revenue (confirmed)", value: finance.platformRevenue, format: "naira" },
    { label: "Scribe pool (confirmed)", value: finance.scribePool, format: "naira" },
    { label: "Platform share of confirmed sales", value: finance.platformSharePercent, format: "percent" },
    { label: "Scribe share of confirmed sales", value: finance.scribeSharePercent, format: "percent" },
    { label: "Transactions kept", value: finance.transactionCount, format: "int" },
    { label: "Platform revenue this month", value: s.thisMonth, format: "naira" },
    { label: "Platform revenue last month", value: s.lastMonth, format: "naira" },
    { label: "Month-on-month change", value: s.monthChangePercent, format: "percent" },
    { label: "Average sale", value: s.averageSale, format: "naira" },
    { label: "Refund rate", value: s.refundRatePercent, format: "percent" },
    { label: "Forecast, next month (platform)", value: analysis.forecast.base, format: "naira" },
    { label: "Forecast range — low", value: analysis.forecast.low, format: "naira" },
    { label: "Forecast range — high", value: analysis.forecast.high, format: "naira" },
    { label: "Credit issued", value: finance.creditIssued, format: "naira" },
    { label: "Credit redeemed", value: finance.creditRedeemed, format: "naira" },
    { label: "Credit outstanding", value: finance.creditOutstanding, format: "naira" },
    { label: "Disputed sales", value: finance.disputedCount, format: "int" },
  ]);

  addTableSheet(wb, {
    name: "Monthly",
    columns: [
      { header: "Month", key: "month" },
      { header: "Sales", key: "sales", format: "int" },
      { header: "Gross", key: "gross", format: "naira" },
      { header: "Platform (confirmed)", key: "platform", format: "naira" },
      { header: "Scribes (confirmed)", key: "scribe", format: "naira" },
      { header: "Platform (pending)", key: "pending", format: "naira" },
      { header: "Refunded sales", key: "refundedCount", format: "int" },
      { header: "Refunded value", key: "refundedValue", format: "naira" },
      { header: "Disputed sales", key: "disputedCount", format: "int" },
      { header: "Disputed value", key: "disputedValue", format: "naira" },
    ],
    rows: analysis.months.map((m) => ({
      month: `${m.label} ${m.year}`, sales: m.sales, gross: m.gross, platform: m.platform, scribe: m.scribe, pending: m.pendingPlatform,
      refundedCount: m.refundedCount, refundedValue: m.refundedValue, disputedCount: m.disputedCount, disputedValue: m.disputedValue,
    })),
  });

  addTableSheet(wb, {
    name: "Escrow",
    columns: [
      { header: "Bucket", key: "bucket", width: 30 },
      { header: "Sales", key: "count", format: "int" },
      { header: "Total", key: "total", format: "naira" },
      { header: "Scribe portion", key: "scribe", format: "naira" },
      { header: "Platform portion", key: "platform", format: "naira" },
    ],
    rows: [
      { bucket: "Clearing (inside refund window)", count: finance.clearing.count, total: finance.clearing.total, scribe: finance.clearing.scribePortion, platform: finance.clearing.platformPortion },
      { bucket: "Refund review (waiting on admin)", count: finance.refundReview.count, total: finance.refundReview.total, scribe: finance.refundReview.scribePortion, platform: finance.refundReview.platformPortion },
      { bucket: "Credits outstanding", count: null, total: finance.creditOutstanding, scribe: null, platform: null },
    ],
  });

  const l = analysis.losses;
  addTableSheet(wb, {
    name: "Losses",
    columns: [
      { header: "Where money leaks", key: "what", width: 36 },
      { header: "Sales", key: "count", format: "int" },
      { header: "Value", key: "value", format: "naira" },
      { header: "Platform cut lost", key: "lost", format: "naira" },
      { header: "Note", key: "note", width: 70 },
    ],
    rows: [
      { what: "Refunded as credit", count: l.refunded.count, value: l.refunded.total, lost: l.refunded.lostPlatform, note: l.refunded.note },
      { what: "Disputed (chargebacks)", count: l.disputed.count, value: l.disputed.total, lost: l.disputed.lostPlatform, note: l.disputed.note },
      { what: "Request-price discount", count: l.discount.sales, value: l.discount.amount, lost: l.discount.amount, note: l.discount.note },
    ],
  });

  const src = analysis.sources;
  const sourceRows = [
    ...src.courses.map((r) => ({ type: "Course", name: r.name, detail: r.detail ?? "", sales: r.sales, platform: r.platform })),
    ...src.blocks.map((r) => ({ type: "Block", name: r.name, detail: r.detail ?? "", sales: r.sales, platform: r.platform })),
    ...src.scribes.map((r) => ({ type: "Scribe", name: r.name, detail: r.detail ?? "", sales: r.sales, platform: r.platform })),
  ];
  addTableSheet(wb, {
    name: "Sources",
    columns: [
      { header: "Type", key: "type" },
      { header: "Name", key: "name", width: 36 },
      { header: "Detail", key: "detail", width: 36 },
      { header: "Sales", key: "sales", format: "int" },
      { header: "Platform revenue", key: "platform", format: "naira" },
    ],
    rows: sourceRows,
  });

  const statusOf = (p: (typeof purchases)[number]) =>
    p.disputedAt ? "Disputed" : p.refundedAt ? "Refunded" : ({ confirmed: "Confirmed", clearing: "Clearing", refund_review: "Refund review" } as const)[saleStatus(p, holdCutoff)];

  addTableSheet(wb, {
    name: "Ledger",
    columns: [
      { header: "Date", key: "date", format: "datetime" },
      { header: "Buyer", key: "buyer", width: 26 },
      { header: "Scribe", key: "scribe", width: 26 },
      { header: "Course", key: "course" },
      { header: "Block", key: "block", width: 36 },
      { header: "Price", key: "price", format: "naira" },
      { header: "Cash paid", key: "cash", format: "naira" },
      { header: "Credit used", key: "credit", format: "naira" },
      { header: "Scribe cut", key: "scribeCut", format: "naira" },
      { header: "Platform cut", key: "platformCut", format: "naira" },
      { header: "Coupon", key: "coupon" },
      { header: "Status", key: "status" },
    ],
    rows: purchases.map((p) => {
      const price = effectivePrice(p);
      return {
        date: p.purchasedAt, buyer: p.buyer.fullName, scribe: p.note.scribe.fullName, course: p.block.course.code, block: p.block.title,
        price, cash: p.amountPaid, credit: p.creditApplied, scribeCut: computeScribeCut(price), platformCut: computePlatformCut(price),
        coupon: p.redeemedWithCoupon ? "Yes" : "No", status: statusOf(p),
      };
    }),
  });

  const labels = analysis.months.map((m) => `${m.label} ${String(m.year).slice(2)}`);
  addChartsSheet(wb, [
    renderChart({ title: "Confirmed revenue split by month", kind: "bar", money: true, labels, series: [
      { name: "Platform", values: analysis.months.map((m) => m.platform), color: "#2563eb" },
      { name: "Scribes", values: analysis.months.map((m) => m.scribe), color: "#16a34a" },
    ] }),
    renderChart({ title: "Sales per month", kind: "line", labels, series: [{ name: "Sales", values: analysis.months.map((m) => m.sales), color: "#7c3aed" }] }),
    renderChart({ title: "Refunded value per month", kind: "bar", money: true, labels, series: [{ name: "Refunded", values: analysis.months.map((m) => m.refundedValue), color: "#dc2626" }] }),
  ]);

  return wb;
}

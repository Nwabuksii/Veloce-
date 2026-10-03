import { prisma } from "@/lib/prisma";
import { computeScribeCut, computePlatformCut, effectivePrice, EARNINGS_HOLD_MINUTES, REQUEST_FULFILLED_PRICE } from "@/lib/pricing";
import { saleStatus } from "@/lib/withdrawal";

// Monthly revenue analysis for the admin: what happened, what is still to come,
// where the money comes from, and where it leaks. Same rules as lib/finance.ts:
// a sale only counts as revenue once it is CONFIRMED; sales still clearing or
// under refund review are "pipeline"; refunded sales are not revenue (the buyer
// has the money back as credit); disputed sales left through a chargeback.

const MONTHS = 12;
const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

export interface MonthRow {
  label: string; // "Oct"
  year: number;
  sales: number; // purchases made that month
  gross: number; // value of all of them
  platform: number; // confirmed platform cut
  scribe: number; // confirmed scribe cut
  pendingPlatform: number; // platform cut still clearing / under review
  refundedValue: number; // sales refunded back as credit
  refundedCount: number;
  disputedValue: number; // chargebacks
  disputedCount: number;
}

export interface SourceRow {
  name: string;
  detail?: string;
  sales: number;
  platform: number;
}

const round = (n: number) => Math.round(n);

export async function getFinanceAnalysis(universityId: string) {
  const now = new Date();
  const holdCutoff = new Date(now.getTime() - EARNINGS_HOLD_MINUTES * 60 * 1000);

  const purchases = await prisma.purchase.findMany({
    where: { block: { course: { department: { universityId } } } },
    select: {
      purchasedAt: true,
      amountPaid: true,
      creditApplied: true,
      refundedAt: true,
      disputedAt: true,
      note: { select: { fulfillsRequestId: true, scribe: { select: { id: true, fullName: true } } } },
      block: { select: { id: true, title: true, course: { select: { code: true, name: true } } } },
      reports: { where: { type: "REFUND" }, select: { status: true } },
    },
  });

  // Month buckets, oldest first, ending with the current month.
  const buckets: MonthRow[] = [];
  const index = new Map<string, number>();
  for (let i = MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    index.set(monthKey(d), buckets.length);
    buckets.push({
      label: d.toLocaleString("en-US", { month: "short" }),
      year: d.getFullYear(),
      sales: 0, gross: 0, platform: 0, scribe: 0, pendingPlatform: 0,
      refundedValue: 0, refundedCount: 0, disputedValue: 0, disputedCount: 0,
    });
  }

  const byCourse = new Map<string, SourceRow>();
  const byBlock = new Map<string, SourceRow>();
  const byScribe = new Map<string, SourceRow>();
  const bump = (map: Map<string, SourceRow>, key: string, name: string, detail: string | undefined, platform: number) => {
    const row = map.get(key) ?? { name, detail, sales: 0, platform: 0 };
    row.sales += 1;
    row.platform += platform;
    map.set(key, row);
  };

  let confirmedPlatform = 0, confirmedScribe = 0, confirmedCount = 0;
  let clearing = { count: 0, total: 0, platform: 0, scribe: 0 };
  let review = { count: 0, total: 0, platform: 0, scribe: 0 };
  let refunded = { count: 0, total: 0, lostPlatform: 0 };
  let disputed = { count: 0, total: 0, lostPlatform: 0 };
  let discountSales = 0, discountLeak = 0; // request-price sales and what the ₦100 discount cost
  let cashIn = 0, creditUsed = 0;
  let totalSales = 0;

  for (const p of purchases) {
    const price = effectivePrice(p);
    const scribeCut = computeScribeCut(price);
    const platformCut = computePlatformCut(price);
    const i = index.get(monthKey(p.purchasedAt));
    const row = i === undefined ? null : buckets[i];
    totalSales += 1;
    cashIn += p.amountPaid;
    creditUsed += p.creditApplied;
    if (row) {
      row.sales += 1;
      row.gross += price;
    }

    if (p.disputedAt) {
      disputed.count += 1; disputed.total += price; disputed.lostPlatform += platformCut;
      if (row) { row.disputedValue += price; row.disputedCount += 1; }
      continue;
    }
    if (p.refundedAt) {
      refunded.count += 1; refunded.total += price; refunded.lostPlatform += platformCut;
      if (row) { row.refundedValue += price; row.refundedCount += 1; }
      continue;
    }

    const status = saleStatus(p, holdCutoff);
    if (status === "confirmed") {
      confirmedPlatform += platformCut; confirmedScribe += scribeCut; confirmedCount += 1;
      if (row) { row.platform += platformCut; row.scribe += scribeCut; }
      const course = p.block.course;
      bump(byCourse, course.code, course.code, course.name, platformCut);
      bump(byBlock, p.block.id, p.block.title, course.code, platformCut);
      bump(byScribe, p.note.scribe.id, p.note.scribe.fullName, undefined, platformCut);
    } else {
      const bucket = status === "clearing" ? clearing : review;
      bucket.count += 1; bucket.total += price; bucket.platform += platformCut; bucket.scribe += scribeCut;
      if (row) row.pendingPlatform += platformCut;
    }

    // A request-price sale gives up the difference to the normal block price.
    if (p.note.fulfillsRequestId && price === REQUEST_FULFILLED_PRICE) {
      discountSales += 1;
      discountLeak += 1000 - REQUEST_FULFILLED_PRICE;
    }
  }

  // ── Trend and forecast (platform revenue, confirmed) ──
  const series = buckets.map((b) => b.platform);
  // Only completed months say anything about the future; the current month is partial.
  const completed = series.slice(0, -1);
  const last3 = completed.slice(-3);
  const avg3 = last3.length ? last3.reduce((a, b) => a + b, 0) / last3.length : 0;
  const prev3 = completed.slice(-6, -3);
  const prevAvg = prev3.length ? prev3.reduce((a, b) => a + b, 0) / prev3.length : 0;
  // Growth between the last three months and the three before, held to ±50% so one big month can't run away.
  const growth = prevAvg > 0 ? Math.max(-0.5, Math.min(0.5, avg3 / prevAvg - 1)) : 0;
  const thisMonth = series[series.length - 1] ?? 0;
  const lastMonth = series[series.length - 2] ?? 0;

  // Of what is clearing / under review, how much usually survives? Use the real refund rate.
  const resolved = confirmedCount + refunded.count + disputed.count;
  const refundRate = resolved > 0 ? (refunded.count + disputed.count) / resolved : 0;

  const forecast = {
    base: round(avg3 * (1 + growth)),
    low: last3.length ? round(Math.min(...last3)) : 0,
    high: last3.length ? round(Math.max(...last3)) : 0,
    growthPercent: Math.round(growth * 100),
    basedOnMonths: last3.length,
  };

  const top = (map: Map<string, SourceRow>) => [...map.values()].sort((a, b) => b.platform - a.platform || b.sales - a.sales).slice(0, 5);
  const pipelinePlatform = clearing.platform + review.platform;

  return {
    months: buckets,
    summary: {
      confirmedPlatform,
      confirmedScribe,
      confirmedCount,
      totalSales,
      thisMonth,
      lastMonth,
      monthChangePercent: lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null,
      averageSale: totalSales > 0 ? round((cashIn + creditUsed) / totalSales) : 0,
      refundRatePercent: Math.round(refundRate * 1000) / 10,
    },
    // Gains still to come
    pipeline: {
      clearing,
      review,
      platformIfAllClears: pipelinePlatform,
      platformExpected: round(pipelinePlatform * (1 - refundRate)),
      platformAtRisk: review.platform,
    },
    // Where money is lost or leaks
    losses: {
      refunded: { ...refunded, note: "Returned to buyers as credit — the platform's cut on these never became revenue." },
      disputed: { ...disputed, note: "Charged back through the bank — cash that actually left." },
      discount: { sales: discountSales, amount: discountLeak, note: "Platform cut given up on request-priced sales (₦900 instead of ₦1,000)." },
      creditOutstanding: (await prisma.user.aggregate({ where: { universityId }, _sum: { creditBalance: true } }))._sum.creditBalance ?? 0,
    },
    forecast,
    sources: {
      courses: top(byCourse),
      blocks: top(byBlock),
      scribes: top(byScribe),
      cash: cashIn,
      credit: creditUsed,
    },
  };
}

export type FinanceAnalysis = Awaited<ReturnType<typeof getFinanceAnalysis>>;

import { prisma } from "@/lib/prisma";
import { badgeTitle } from "@/lib/badges";
import { addSummarySheet, addTableSheet, newWorkbook } from "@/lib/xlsx-export";

// "Download my data": everything a person has in Veloce that is theirs, as
// one Excel sheet per table. Only ever built from the signed-in user's own id.
//
// Deliberately NOT in here: password hash, two-step secrets and recovery
// codes, login/reset/verification tokens, security logs, reports filed
// AGAINST the user, admin notes, file contents, and other people's personal
// data (a followed scribe's name is public profile, nothing more).

export async function buildPersonalExport(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      fullName: true,
      email: true,
      role: true,
      level: true,
      theme: true,
      creditBalance: true,
      createdAt: true,
      termsAcceptedAt: true,
      emailVerifiedAt: true,
      bankName: true,
      accountName: true,
      accountNumber: true,
      university: { select: { name: true } },
      department: { select: { name: true } },
    },
  });

  const [purchases, reviews, follows, votes, messages, feedback, reports, notes, payouts, badges, applications] = await Promise.all([
    prisma.purchase.findMany({
      where: { buyerId: userId },
      orderBy: { purchasedAt: "desc" },
      select: { purchasedAt: true, amountPaid: true, creditApplied: true, refundedAt: true, block: { select: { title: true, course: { select: { code: true } } } } },
    }),
    prisma.review.findMany({
      where: { reviewerId: userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, rating: true, comment: true, note: { select: { block: { select: { title: true, course: { select: { code: true } } } } } } },
    }),
    prisma.follow.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, scribe: { select: { fullName: true } } },
    }),
    prisma.requestVote.findMany({
      where: { studentId: userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, request: { select: { requestedTitle: true, status: true, course: { select: { code: true } } } } },
    }),
    prisma.adminMessage.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, subject: true, body: true, readAt: true },
    }),
    prisma.feedback.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: { createdAt: true, message: true } }),
    prisma.report.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, type: true, reason: true, status: true },
    }),
    prisma.note.findMany({
      where: { scribeId: userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, status: true, pageCount: true, block: { select: { title: true, course: { select: { code: true } } } } },
    }),
    prisma.payout.findMany({
      where: { scribeId: userId },
      orderBy: { requestedAt: "desc" },
      select: { requestedAt: true, amount: true, status: true, paidAt: true, failureReason: true },
    }),
    prisma.scribeBadge.findMany({
      where: { scribeId: userId },
      orderBy: { awardedAt: "desc" },
      select: { badgeKey: true, periodType: true, periodKey: true, awardedAt: true },
    }),
    prisma.scribeApplication.findMany({
      where: { userId },
      orderBy: { submittedAt: "desc" },
      select: { type: true, reason: true, status: true, submittedAt: true, reviewedAt: true },
    }),
  ]);

  const wb = newWorkbook();
  const yesNo = (b: boolean) => (b ? "Yes" : "No");

  const profile = [
    { label: "Name", value: user.fullName },
    { label: "Email", value: user.email },
    { label: "Role", value: user.role.charAt(0) + user.role.slice(1).toLowerCase() },
    { label: "School", value: user.university.name },
    { label: "Department", value: user.department?.name ?? "Not set" },
    { label: "Level", value: user.level ?? "Not set" },
    { label: "Joined", value: user.createdAt, format: "date" as const },
    { label: "Terms accepted", value: user.termsAcceptedAt, format: "date" as const },
    { label: "Theme", value: user.theme },
    { label: "Credit balance", value: user.creditBalance, format: "naira" as const },
  ];
  if (user.bankName || user.accountName || user.accountNumber) {
    profile.push(
      { label: "Payout bank", value: user.bankName ?? "" },
      { label: "Payout account name", value: user.accountName ?? "" },
      // Last four digits only — the full number never leaves the database.
      { label: "Payout account (last 4 digits)", value: user.accountNumber ? user.accountNumber.slice(-4) : "" }
    );
  }
  addSummarySheet(wb, "Profile", "Your Veloce data", profile);

  addTableSheet(wb, {
    name: "Purchases",
    columns: [
      { header: "Date", key: "date", format: "date" },
      { header: "Course", key: "course" },
      { header: "Note", key: "note", width: 40 },
      { header: "Paid (cash)", key: "paid", format: "naira" },
      { header: "Credit used", key: "credit", format: "naira" },
      { header: "Refunded", key: "refunded" },
      { header: "Refunded on", key: "refundedOn", format: "date" },
    ],
    rows: purchases.map((p) => ({
      date: p.purchasedAt,
      course: p.block.course.code,
      note: p.block.title,
      paid: p.amountPaid,
      credit: p.creditApplied,
      refunded: yesNo(Boolean(p.refundedAt)),
      refundedOn: p.refundedAt,
    })),
  });

  addTableSheet(wb, {
    name: "Reviews",
    columns: [
      { header: "Date", key: "date", format: "date" },
      { header: "Course", key: "course" },
      { header: "Note", key: "note", width: 40 },
      { header: "Rating", key: "rating", format: "int" },
      { header: "Comment", key: "comment", width: 60 },
    ],
    rows: reviews.map((r) => ({ date: r.createdAt, course: r.note.block.course.code, note: r.note.block.title, rating: r.rating, comment: r.comment ?? "" })),
  });

  addTableSheet(wb, {
    name: "Follows",
    columns: [
      { header: "Scribe", key: "scribe", width: 30 },
      { header: "Followed on", key: "date", format: "date" },
    ],
    rows: follows.map((f) => ({ scribe: f.scribe.fullName, date: f.createdAt })),
  });

  addTableSheet(wb, {
    name: "Requests",
    columns: [
      { header: "Voted on", key: "date", format: "date" },
      { header: "Course", key: "course" },
      { header: "Requested note", key: "title", width: 40 },
      { header: "Status", key: "status" },
    ],
    rows: votes.map((v) => ({ date: v.createdAt, course: v.request.course.code, title: v.request.requestedTitle, status: v.request.status })),
  });

  addTableSheet(wb, {
    name: "Messages",
    columns: [
      { header: "Date", key: "date", format: "datetime" },
      { header: "Subject", key: "subject", width: 40 },
      { header: "Message", key: "body", width: 80 },
      { header: "Read", key: "read" },
    ],
    rows: messages.map((m) => ({ date: m.createdAt, subject: m.subject, body: m.body, read: yesNo(Boolean(m.readAt)) })),
  });

  addTableSheet(wb, {
    name: "Feedback",
    columns: [
      { header: "Date", key: "date", format: "datetime" },
      { header: "Message", key: "message", width: 80 },
    ],
    rows: feedback.map((f) => ({ date: f.createdAt, message: f.message })),
  });

  addTableSheet(wb, {
    name: "Reports filed",
    columns: [
      { header: "Date", key: "date", format: "datetime" },
      { header: "Type", key: "type" },
      { header: "Reason", key: "reason", width: 60 },
      { header: "Status", key: "status" },
    ],
    rows: reports.map((r) => ({ date: r.createdAt, type: r.type, reason: r.reason, status: r.status })),
  });

  // Scribe-side sheets appear only for people who have that history, so a
  // plain student's file isn't padded with empty tables.
  if (applications.length > 0) {
    addTableSheet(wb, {
      name: "Scribe application",
      columns: [
        { header: "Submitted", key: "submitted", format: "date" },
        { header: "Type", key: "type" },
        { header: "Reason", key: "reason", width: 60 },
        { header: "Status", key: "status" },
        { header: "Reviewed", key: "reviewed", format: "date" },
      ],
      rows: applications.map((a) => ({ submitted: a.submittedAt, type: a.type, reason: a.reason, status: a.status, reviewed: a.reviewedAt })),
    });
  }

  if (notes.length > 0) {
    addTableSheet(wb, {
      name: "Notes",
      columns: [
        { header: "Uploaded", key: "date", format: "date" },
        { header: "Course", key: "course" },
        { header: "Block", key: "block", width: 40 },
        { header: "Status", key: "status" },
        { header: "Pages", key: "pages", format: "int" },
      ],
      rows: notes.map((n) => ({ date: n.createdAt, course: n.block.course.code, block: n.block.title, status: n.status, pages: n.pageCount })),
    });
  }

  if (payouts.length > 0) {
    addTableSheet(wb, {
      name: "Payouts",
      columns: [
        { header: "Requested", key: "requested", format: "date" },
        { header: "Amount", key: "amount", format: "naira" },
        { header: "Status", key: "status" },
        { header: "Paid on", key: "paid", format: "date" },
        { header: "Failure reason", key: "failure", width: 40 },
      ],
      rows: payouts.map((p) => ({ requested: p.requestedAt, amount: p.amount, status: p.status, paid: p.paidAt, failure: p.failureReason ?? "" })),
    });
  }

  if (badges.length > 0) {
    addTableSheet(wb, {
      name: "Badges",
      columns: [
        { header: "Badge", key: "badge", width: 36 },
        { header: "Period", key: "period" },
        { header: "Awarded", key: "awarded", format: "date" },
      ],
      rows: badges.map((b) => ({ badge: badgeTitle(b.badgeKey), period: `${b.periodType} ${b.periodKey}`, awarded: b.awardedAt })),
    });
  }

  return { workbook: wb, email: user.email };
}

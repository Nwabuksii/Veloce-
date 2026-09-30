"use client";

import { ReactElement, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
import { fetchAdminCounts, AdminCounts } from "@/lib/admin-counts";

interface HubLink {
  icon: ReactElement;
  label: string;
  description: string;
  href: string;
  countKey?: keyof Omit<AdminCounts, "total">;
}

interface HubGroup {
  title: string;
  blurb: string;
  icon: ReactElement;
  links: HubLink[];
}

const GROUPS: HubGroup[] = [
  {
    title: "Trust & moderation",
    blurb: "Decisions waiting on an admin.",
    icon: AIcon.warn(),
    links: [
      { icon: AIcon.user(), label: "Scribe applications", description: "Approve or reject people applying to become scribes", href: "/admin/applications", countKey: "applications" },
      { icon: AIcon.back(), label: "Appeals", description: "Demoted scribes asking for reinstatement", href: "/admin/appeals", countKey: "appeals" },
      { icon: AIcon.check(), label: "Moderation queue", description: "Newly uploaded notes awaiting review", href: "/admin/moderation", countKey: "moderation" },
      { icon: AIcon.flag(), label: "Reports", description: "Content reports and refund requests from students", href: "/admin/reports", countKey: "reports" },
    ],
  },
  {
    title: "Money",
    blurb: "Withdrawals and the platform ledger.",
    icon: AIcon.coin(),
    links: [
      { icon: AIcon.coin(), label: "Payouts", description: "Scribe withdrawal requests awaiting approval", href: "/admin/payouts", countKey: "payouts" },
      { icon: AIcon.chart(), label: "Financial ledger", description: "Revenue, scribe pool, and refund credit stats", href: "/admin/finance", countKey: "disputes" },
    ],
  },
  {
    title: "People",
    blurb: "Accounts, scribes and direct messages.",
    icon: AIcon.user(),
    links: [
      { icon: AIcon.user(), label: "Manage users", description: "Ban or unban an account", href: "/admin/users" },
      { icon: AIcon.workshop(), label: "Manage scribes", description: "Demote a scribe back to student", href: "/admin/scribes", countKey: "demotedScribes" },
      { icon: AIcon.send(), label: "Message a user", description: "Send someone a direct message", href: "/admin/messages" },
      { icon: AIcon.eye(), label: "Security history", description: "Failed logins, bans, role changes, payouts and other sensitive actions", href: "/admin/security" },
    ],
  },
  {
    title: "Feedback",
    blurb: "What people are saying about the site.",
    icon: AIcon.message(),
    links: [
      { icon: AIcon.message(), label: "Feedback inbox", description: "What people are saying about the site", href: "/admin/feedback", countKey: "feedback" },
      { icon: AIcon.chart(), label: "Advanced analytics", description: "See poll responses grouped by vote, department, and result trends", href: "/admin/advanced-analytics" },
    ],
  },
];

export default function AdminHubPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [counts, setCounts] = useState<AdminCounts | null>(null);

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
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    fetchAdminCounts().then(setCounts);
  }, [ready]);

  if (!ready) return null;

  const num = (n: number | undefined) => (counts ? n ?? 0 : "—");

  return (
    <div className="page-wrap">
      <AdminPageHeader section="Control" title="Admin" serif="overview" subtitle="Everything waiting on you — moderation, money, and people.">
        <button className="btn btn-ghost" onClick={() => router.push("/admin/messages")}>
          {AIcon.send()} Message users
        </button>
        <button className="btn btn-primary" onClick={() => router.push("/admin/moderation")}>
          {AIcon.check()} Moderation queue
        </button>
      </AdminPageHeader>

      <div className="three-col mb-24">
        <div className="stat-tile">
          <div className="label">Needs attention</div>
          <div className="value">{num(counts?.total)}</div>
          <span className="delta warn">{AIcon.warn()} Items across all queues</span>
        </div>
        <div className="stat-tile">
          <div className="label">Notes in review</div>
          <div className="value">{num(counts?.moderation)}</div>
          <span className="delta warn">{AIcon.spark()} Moderation queue</span>
        </div>
        <div className="stat-tile">
          <div className="label">Open reports</div>
          <div className="value">{num(counts?.reports)}</div>
          <span className="delta warn">{AIcon.flag()} Student complaints</span>
        </div>
        <div className="stat-tile">
          <div className="label">Payout requests</div>
          <div className="value">{num(counts?.payouts)}</div>
          <span className="delta warn">{AIcon.coin()} Withdrawals to action</span>
        </div>
      </div>

      <div className="two-col">
        {GROUPS.map((group) => (
          <div className="panel" key={group.title}>
            <h2 className="panel-title">
              {group.icon} {group.title}
            </h2>
            <p className="panel-desc">{group.blurb}</p>
            <div className="stack-10">
              {group.links.map((link) => {
                const count = link.countKey && counts ? counts[link.countKey] : 0;
                return (
                  <button key={link.href} type="button" className="data-row link-row" onClick={() => router.push(link.href)}>
                    <div>
                      <div className="row-title">{link.label}</div>
                      <div className="row-desc">{link.description}</div>
                    </div>
                    {count > 0 && <span className="count-badge">{count > 9 ? "9+" : count}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

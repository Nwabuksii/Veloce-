"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import PageHeader from "@/app/components/PageHeader";
import { fetchAdminCounts, AdminCounts } from "@/lib/admin-counts";

interface HubLink {
  icon: string;
  label: string;
  description: string;
  href: string;
  countKey?: keyof Omit<AdminCounts, "total">;
}

interface HubGroup {
  title: string;
  links: HubLink[];
}

const GROUPS: HubGroup[] = [
  {
    title: "Trust & moderation",
    links: [
      { icon: "fa-user-cog", label: "Scribe applications", description: "Approve or reject people applying to become scribes", href: "/admin/applications", countKey: "applications" },
      { icon: "fa-undo", label: "Appeals", description: "Demoted scribes asking for reinstatement", href: "/admin/appeals", countKey: "appeals" },
      { icon: "fa-flag", label: "Moderation queue", description: "Newly uploaded notes awaiting review", href: "/admin/moderation", countKey: "moderation" },
      { icon: "fa-exclamation-triangle", label: "Reports", description: "Content reports and refund requests from students", href: "/admin/reports", countKey: "reports" },
    ],
  },
  {
    title: "Money",
    links: [
      { icon: "fa-money-bill-wave", label: "Payouts", description: "Scribe withdrawal requests awaiting approval", href: "/admin/payouts", countKey: "payouts" },
      { icon: "fa-chart-line", label: "Financial ledger", description: "Revenue, scribe pool, and refund credit stats", href: "/admin/finance", countKey: "disputes" },
    ],
  },
  {
    title: "People",
    links: [
      { icon: "fa-ban", label: "Manage users", description: "Ban or unban an account", href: "/admin/users" },
      { icon: "fa-user-minus", label: "Manage scribes", description: "Demote a scribe back to student", href: "/admin/scribes", countKey: "demotedScribes" },
      { icon: "fa-envelope-open-text", label: "Message a user", description: "Send someone a direct message", href: "/admin/messages" },
    ],
  },
  {
    title: "Feedback",
    links: [
      { icon: "fa-comment-dots", label: "Feedback inbox", description: "What people are saying about the site", href: "/admin/feedback", countKey: "feedback" },
      { icon: "fa-chart-pie", label: "Advanced analytics", description: "See poll responses grouped by vote, department, and result trends", href: "/admin/advanced-analytics" },
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

  return (
    <div className="page-wrap">
      <div className="app-container">
        <PageHeader title="Admin" subtitle="Control hub" />

        <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "1.8rem" }}>
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h2 style={{ fontSize: "1rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>{group.title}</h2>
              <div className="ledger-list">
                {group.links.map((link) => (
                  <button
                    key={link.href}
                    className="ledger-row press-on-tap"
                    style={{ width: "100%", background: "none", cursor: "pointer", textAlign: "left" }}
                    onClick={() => router.push(link.href)}
                  >
                    <div className="ledger-row-head">
                      <span className="ledger-row-title">
                        <i className={`fas ${link.icon}`} style={{ color: "var(--accent)", width: "1.2rem" }}></i> {link.label}
                        {link.countKey && counts && counts[link.countKey] > 0 && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              marginLeft: "0.5rem",
                              background: "var(--text-danger)",
                              color: "white",
                              borderRadius: "999px",
                              minWidth: 18,
                              height: 18,
                              padding: "0 0.35rem",
                              fontSize: "0.65rem",
                              fontWeight: 700,
                              verticalAlign: "middle",
                            }}
                          >
                            {counts[link.countKey] > 9 ? "9+" : counts[link.countKey]}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="ledger-row-meta">{link.description}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

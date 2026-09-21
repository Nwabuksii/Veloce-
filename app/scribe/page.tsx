"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import PageHeader from "@/app/components/PageHeader";

interface HubLink {
  icon: string;
  label: string;
  description: string;
  href: string;
}

const LINKS: HubLink[] = [
  { icon: "fa-store", label: "Workspace", description: "Your uploaded notes and their status", href: "/scribe/workspace" },
  { icon: "fa-chart-simple", label: "Analytics", description: "Your scribe score, sales trend, and per-block performance", href: "/scribe/analytics" },
  { icon: "fa-wallet", label: "Earnings", description: "Confirmed and pending money, withdrawals", href: "/scribe/earnings" },
  { icon: "fa-cloud-upload-alt", label: "Upload notes", description: "Add a new version to a course block", href: "/scribe/upload" },
  { icon: "fa-fire", label: "Discovery feed", description: "Student requests you could fulfill", href: "/scribe/requests" },
];

export default function ScribeHubPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
      return;
    }
    if (user.role !== "SCRIBE" && user.role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="page-wrap">
      <div className="app-container">
        <PageHeader title="Scribe Studio" subtitle="Everything for publishing and managing your notes." />

        <div style={{ marginTop: "1.5rem" }}>
          <div className="ledger-list">
            {LINKS.map((link) => (
              <button
                key={link.href}
                className="ledger-row press-on-tap"
                style={{ width: "100%", background: "none", cursor: "pointer", textAlign: "left" }}
                onClick={() => router.push(link.href)}
              >
                <div className="ledger-row-head">
                  <span className="ledger-row-title">
                    <i className={`fas ${link.icon}`} style={{ color: "var(--accent)", width: "1.2rem" }}></i> {link.label}
                  </span>
                </div>
                <div className="ledger-row-meta">{link.description}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

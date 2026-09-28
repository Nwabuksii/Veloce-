"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ReactElement } from "react";
import { getStoredUser } from "@/lib/client-session";
import PageHeader from "@/app/components/PageHeader";
import { Icon } from "@/app/components/icons";

interface HubLink {
  icon: ReactElement;
  label: string;
  description: string;
  href: string;
}

const LINKS: HubLink[] = [
  { icon: Icon.workshop(), label: "Workspace", description: "Your uploaded notes, their status and performance", href: "/scribe/workspace" },
  { icon: Icon.chart(), label: "Analytics", description: "Your scribe score, sales trend, and per-block performance", href: "/scribe/analytics" },
  { icon: Icon.coin(), label: "Earnings", description: "Confirmed and pending money, withdrawals", href: "/scribe/earnings" },
  { icon: Icon.upload(), label: "Upload notes", description: "Add a new version to a course block", href: "/scribe/upload" },
  { icon: Icon.compass(), label: "Discovery feed", description: "Student requests you could fulfil", href: "/scribe/requests" },
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
      <PageHeader
        eyebrow="Scribe Workspace"
        title="Your"
        accent="studio"
        subtitle="Everything for publishing and managing your notes — track performance and keep your library fresh for the students who follow you."
      >
        <button className="btn btn-ghost" onClick={() => router.push("/scribe/requests")}>
          Discovery feed
        </button>
        <button className="btn btn-primary" onClick={() => router.push("/scribe/upload")}>
          {Icon.upload()} Upload notes
        </button>
      </PageHeader>

      <div className="hub-grid">
        {LINKS.map((link) => (
          <button key={link.href} type="button" className="hub-card" onClick={() => router.push(link.href)}>
            <span className="hub-icon">{link.icon}</span>
            <span className="hub-title">{link.label}</span>
            <span className="hub-desc">{link.description}</span>
            <span className="hub-go">
              Open {Icon.arrow()}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

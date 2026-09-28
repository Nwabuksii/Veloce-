"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, StoredUser } from "@/lib/client-session";
import PageHeader from "@/app/components/PageHeader";
import { SkeletonList } from "@/app/components/Skeleton";
import { Icon } from "@/app/components/icons";
import { friendlyErrorMessage } from "@/lib/api-client";

interface ScribeNote {
  id: string;
  status: string;
  blockId: string;
  blockTitle: string;
  courseCode: string;
  courseName: string;
  salesCount: number;
  avgRating: number | null;
  reviewCount: number;
}

const STATUS_STYLES: Record<string, { cls: string; label: string }> = {
  LIVE: { cls: "live", label: "Live" },
  APPROVED: { cls: "live", label: "Live" },
  RENDERING: { cls: "review", label: "Rendering" },
  FLAGGED: { cls: "review", label: "Under review" },
  PENDING_REVIEW: { cls: "review", label: "Under review" },
  REJECTED: { cls: "rejected", label: "Rejected" },
};

const isLive = (status: string) => status === "LIVE" || status === "APPROVED";

export default function ScribeWorkspacePage() {
  const router = useRouter();
  const [notes, setNotes] = useState<ScribeNote[]>([]);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = getStoredUser();

    if (!storedUser) {
      router.push("/login");
      return;
    }
    if (storedUser.role !== "SCRIBE" && storedUser.role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }
    setUser(storedUser);

    fetch("/api/scribe/notes")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load your uploads");
        setNotes(data.notes);
      })
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [router]);

  const totalSales = notes.reduce((sum, n) => sum + n.salesCount, 0);
  const liveCount = notes.filter((n) => isLive(n.status)).length;
  const inReviewCount = notes.filter((n) => !isLive(n.status) && n.status !== "REJECTED").length;
  const totalReviews = notes.reduce((sum, n) => sum + n.reviewCount, 0);
  // Weighted by review count, so one 5★ on a tiny note doesn't outweigh 40 reviews elsewhere.
  const weightedRating =
    totalReviews > 0 ? notes.reduce((sum, n) => sum + (n.avgRating ?? 0) * n.reviewCount, 0) / totalReviews : null;

  async function handleCopyLink(blockId: string, noteId: string) {
    const url = `${window.location.origin}/blocks/${blockId}?note=${noteId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(noteId);
    } catch {
      // Clipboard permission denied — nothing to fall back to silently, so
      // just leave the button unlabeled rather than show a raw error.
    }
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Scribe Workspace"
        title="Your"
        accent="notes"
        subtitle="Your notes, their status and performance — everything you've published in one place."
      >
        <button className="btn btn-ghost" onClick={() => router.push(`/scribe/${user?.id}`)}>
          My public profile
        </button>
        <button className="btn btn-ghost" onClick={() => router.push("/scribe/earnings")}>
          {Icon.coin()} Earnings
        </button>
        <button className="btn btn-primary" onClick={() => router.push("/scribe/upload")}>
          {Icon.upload()} Upload notes
        </button>
      </PageHeader>

      {loading && <SkeletonList rows={4} />}
      {error && <div className="auth-error">{error}</div>}

      {!loading && !error && (
        <>
          <div className="three-col mb-24">
            <div className="stat-card">
              <div className="label">Copies sold</div>
              <div className="value">{totalSales}</div>
              <span className="delta flat">
                {Icon.trend()} across {notes.length} upload{notes.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="stat-card">
              <div className="label">Live notes</div>
              <div className="value">{liveCount}</div>
              <span className="delta">{Icon.check()} visible in catalogue</span>
            </div>
            <div className="stat-card">
              <div className="label">In review</div>
              <div className="value">{inReviewCount}</div>
              <span className={`delta ${inReviewCount > 0 ? "warn" : "flat"}`}>{Icon.spark()} awaiting moderation</span>
            </div>
            <div className="stat-card">
              <div className="label">Avg. rating</div>
              <div className="value">{weightedRating !== null ? weightedRating.toFixed(1) : "—"}</div>
              <span className="delta flat">
                {Icon.star()} {totalReviews} review{totalReviews === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <h2 className="panel-title section-title">{Icon.book()} Your notes</h2>

          {notes.length === 0 ? (
            <div className="panel">
              <div className="empty-state">
                You haven&apos;t uploaded any notes yet — click &ldquo;Upload notes&rdquo; to get started.
              </div>
            </div>
          ) : (
            <div>
              {notes.map((n) => {
                const style = STATUS_STYLES[n.status] || STATUS_STYLES.PENDING_REVIEW;
                return (
                  <div key={n.id} className="data-row data-row--studio">
                    <div>
                      <div className="row-code">{n.courseCode}</div>
                      <div className="row-title">{n.blockTitle}</div>
                      <div className="row-meta">{n.courseName}</div>
                    </div>
                    <div className="row-stat" data-label="Sold">
                      <strong>{n.salesCount}</strong>
                    </div>
                    <div className="row-stat" data-label="Rating">
                      <strong>{n.avgRating != null ? n.avgRating.toFixed(1) : "—"}</strong>
                      {n.avgRating != null && (
                        <span className="hide-sm-inline">
                          {n.reviewCount} review{n.reviewCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <div className="row-actions">
                      <span className={`status ${style.cls}`}>{style.label}</span>
                      {isLive(n.status) && (
                        <>
                          <button className="btn btn-sm btn-ghost" onClick={() => handleCopyLink(n.blockId, n.id)}>
                            {Icon.link()} {copiedId === n.id ? "Copied!" : "Copy link"}
                          </button>
                          <button
                            className="btn btn-sm btn-ghost"
                            aria-label="View note page"
                            title="View note page"
                            onClick={() => router.push(`/blocks/${n.blockId}?note=${n.id}`)}
                          >
                            {Icon.eye()}
                          </button>
                        </>
                      )}
                    </div>
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

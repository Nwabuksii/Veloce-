"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import PageHeader from "@/app/components/PageHeader";
import { SkeletonList } from "@/app/components/Skeleton";
import { Icon } from "@/app/components/icons";
import { friendlyErrorMessage } from "@/lib/api-client";
import { formatDateTime, timeAgo } from "@/lib/time-ago";

interface RequestView {
  id: string;
  requestedTitle: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  voteCount: number;
  createdAt: string;
  recentVotes: { count: number; total: number; from: string | null; to: string | null; times: string[] };
}

export default function ScribeRequestsFeedPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<RequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

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

    fetch("/api/requests")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load requests");
        setRequests(data.requests);
      })
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Scribe · Demand"
        title="Discovery"
        accent="feed"
        subtitle="What students are asking for, ranked by demand. Tap “Fulfil this” to jump straight into upload with the course and title already filled in."
      >
        <button className="btn btn-ghost" onClick={() => router.push("/scribe/workspace")}>
          {Icon.back()} Workspace
        </button>
      </PageHeader>

      {loading && <SkeletonList rows={3} />}
      {error && <div className="auth-error">{error}</div>}
      {!loading && !error && requests.length === 0 && (
        <div className="panel">
          <div className="empty-state">No open requests right now.</div>
        </div>
      )}

      <div className="request-list">
        {requests.map((r) => (
          <div key={r.id}>
          <div className="request-item">
            <div className="vote-block" aria-label={`${r.voteCount} want this`}>
              {Icon.up()}
              <span className="count">{r.voteCount}</span>
            </div>
            <div className="request-body">
              <div className="request-code">{r.courseCode}</div>
              <div className="request-topic">{r.requestedTitle}</div>
              <div className="request-meta">
                <span>
                  {Icon.book()} {r.courseName}
                </span>
                <span>
                  {Icon.users()} {r.voteCount} want this
                </span>
                <span title={formatDateTime(r.createdAt)}>
                  {Icon.clock()} Requested {timeAgo(r.createdAt)}
                </span>
              </div>
            </div>
            <div className="request-actions">
              <button className="btn btn-sm btn-ghost" aria-expanded={openId === r.id} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                {Icon.eye()} Details
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => router.push(`/scribe/upload?requestId=${r.id}&courseId=${r.courseId}`)}
              >
                Fulfil this {Icon.arrow()}
              </button>
            </div>
          </div>
          {openId === r.id && (
            <div className="request-details">
              <div>
                First requested <strong>{formatDateTime(r.createdAt)}</strong> ({timeAgo(r.createdAt)}).
              </div>
              {r.recentVotes.count > 0 && r.recentVotes.from && r.recentVotes.to && (
                <>
                  <div>
                    Most recent 40%: <strong>{r.recentVotes.count}</strong> of {r.recentVotes.total} {r.recentVotes.total === 1 ? "person" : "people"}, between{" "}
                    <strong>{formatDateTime(r.recentVotes.from)}</strong> and <strong>{formatDateTime(r.recentVotes.to)}</strong>.
                  </div>
                  <ul className="request-times">
                    {r.recentVotes.times.map((t, i) => (
                      <li key={i}>
                        {formatDateTime(t)} <span>· {timeAgo(t)}</span>
                      </li>
                    ))}
                    {r.recentVotes.count > r.recentVotes.times.length && <li>+ {r.recentVotes.count - r.recentVotes.times.length} more</li>}
                  </ul>
                </>
              )}
            </div>
          )}
          </div>
        ))}
      </div>
    </div>
  );
}

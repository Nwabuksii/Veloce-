"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import { SkeletonList } from "@/app/components/Skeleton";
import { friendlyErrorMessage } from "@/lib/api-client";
import { Icon } from "@/app/components/icons";

interface RequestView {
  id: string;
  requestedTitle: string;
  courseCode: string;
  courseName: string;
  status: "OPEN" | "FULFILLED";
  voteCount: number;
  fulfilledBlock: { id: string; title: string; price: number; noteId: string | null } | null;
}

export default function MyRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<RequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
      return;
    }

    fetch("/api/requests/mine")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load your requests");
        setRequests(data.requests || []);
      })
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="page-wrap student-page">
      <div className="app-container student-app-container">
        <section className="page-view is-active">
          <div className="page-header">
            <div className="page-header-left">
              <span className="eyebrow">Your Activity</span>
              <h1>
                My <span className="serif">requests</span>
              </h1>
              <p>
                Blocks you've asked for and where they stand. You'll be notified the moment a scribe fulfills one.
              </p>
            </div>
            <div className="page-header-right">
              <div className="header-actions">
                <button className="btn btn-primary" onClick={() => router.push("/requests")}>
                  {Icon.plus()} Request a block
                </button>
              </div>
            </div>
          </div>

          {loading && <SkeletonList rows={3} />}
          {error && <div className="auth-error" style={{ marginTop: 16 }}>{error}</div>}

          {!loading && !error && requests.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">{Icon.plus()}</div>
              <h3 className="empty-title">No requests yet</h3>
              <p className="empty-desc">
                Ask for a course block that isn't in the catalog yet — other students can vote and scribes can prioritize it.
              </p>
              <button className="btn btn-primary" onClick={() => router.push("/requests")}>
                Request a block {Icon.arrow()}
              </button>
            </div>
          )}

          {!loading && !error && requests.length > 0 && (
            <div className="request-list">
              {requests.map((r) => (
                <div key={r.id} className="request-item">
                  <div className="vote-block" aria-hidden="true">
                    {Icon.up()}
                    <span className="count">{r.voteCount}</span>
                  </div>

                  <div className="request-body">
                    <div className="request-code">{r.courseCode}</div>
                    <div className="request-topic">{r.requestedTitle}</div>
                    <div className="request-meta">
                      <span>{Icon.book()} {r.courseName}</span>
                      <span>{Icon.user()} {r.voteCount} student{r.voteCount === 1 ? "" : "s"} want this</span>
                    </div>
                  </div>

                  <div className="request-actions">
                    {r.status === "FULFILLED" && r.fulfilledBlock ? (
                      <>
                        <span className="status fulfilled">{Icon.check()} Fulfilled</span>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() =>
                            router.push(
                              r.fulfilledBlock!.noteId
                                ? `/blocks/${r.fulfilledBlock!.id}?note=${r.fulfilledBlock!.noteId}`
                                : `/blocks/${r.fulfilledBlock!.id}`
                            )
                          }
                        >
                          View version {Icon.arrow()}
                        </button>
                      </>
                    ) : (
                      <span className="status open">{Icon.clock()} Still open</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

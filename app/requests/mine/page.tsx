"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { SkeletonList } from "@/app/components/Skeleton";
import { friendlyErrorMessage } from "@/lib/api-client";

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
        setRequests(data.requests);
      })
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="page-wrap">
      <div className="app-container">
        <div className="top-bar">
          <div className="logo" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Logo size={34} />
            <div>
              <h1>
                Veloce <span className="accent">.</span>
              </h1>
              <div className="logo-sub">My requests</div>
            </div>
          </div>
          <ProfileMenu />
        </div>

        {loading && <SkeletonList rows={3} />}
        {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}
        {!loading && !error && requests.length === 0 && (
          <p style={{ color: "var(--text-secondary)", marginTop: "1rem" }}>
            You haven't requested anything yet — head to "Request a block" to ask for content that doesn't exist yet.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", marginTop: "1rem" }}>
          {requests.map((r) => (
            <div
              key={r.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border-blue)",
                borderRadius: "1rem",
                padding: "1rem 1.2rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.6rem",
              }}
            >
              <div>
                <strong>{r.requestedTitle}</strong>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  {r.courseCode} — {r.courseName}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-info)", marginTop: "0.2rem" }}>
                  <i className="fas fa-fire"></i> {r.voteCount} student{r.voteCount === 1 ? "" : "s"} want this
                </div>
              </div>

              {r.status === "FULFILLED" && r.fulfilledBlock ? (
                <div style={{ textAlign: "right" }}>
                  <span
                    style={{
                      display: "inline-block",
                      background: "var(--bg-success)",
                      color: "var(--text-success)",
                      padding: "0.25rem 0.9rem",
                      borderRadius: "30px",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      marginBottom: "0.5rem",
                    }}
                  >
                    <i className="fas fa-check-circle"></i> Fulfilled
                  </span>
                  <div>
                    <button
                      className="btn btn-primary"
                      onClick={() =>
                        router.push(
                          r.fulfilledBlock!.noteId
                            ? `/blocks/${r.fulfilledBlock!.id}?note=${r.fulfilledBlock!.noteId}`
                            : `/blocks/${r.fulfilledBlock!.id}`
                        )
                      }
                    >
                      View this version
                    </button>
                  </div>
                </div>
              ) : (
                <span
                  style={{
                    background: "var(--bg-warning)",
                    color: "var(--text-warning)",
                    padding: "0.25rem 0.9rem",
                    borderRadius: "30px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                  }}
                >
                  <i className="fas fa-hourglass-half"></i> Still open
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

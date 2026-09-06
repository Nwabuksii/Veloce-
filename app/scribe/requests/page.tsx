"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { friendlyErrorMessage } from "@/lib/api-client";

interface RequestView {
  id: string;
  requestedTitle: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  voteCount: number;
}

export default function ScribeRequestsFeedPage() {
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
      <div className="app-container">
        <div className="top-bar">
          <div className="logo" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Logo size={34} />
            <div>
              <h1>
                Veloce <span className="accent">.</span>
              </h1>
              <div className="logo-sub">Discovery feed — what students want</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="btn" onClick={() => router.push("/scribe/workspace")}>
              <i className="fas fa-arrow-left"></i> Workspace
            </button>
            <ProfileMenu />
          </div>
        </div>

        <p style={{ color: "#5e7188", marginTop: "1rem", fontSize: "0.9rem" }}>
          Ranked by demand. Tap "Fulfill this" to jump straight into upload with the course and title
          already filled in.
        </p>

        {loading && <p style={{ color: "#5e7188", marginTop: "1rem" }}>Loading...</p>}
        {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}
        {!loading && !error && requests.length === 0 && (
          <p style={{ color: "#5e7188", marginTop: "1rem" }}>No open requests right now.</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem", marginTop: "1rem" }}>
          {requests.map((r) => (
            <div
              key={r.id}
              style={{
                background: "white",
                border: "1px solid #e1e8f0",
                borderRadius: "1rem",
                padding: "0.9rem 1.1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <strong>{r.requestedTitle}</strong>
                <div style={{ fontSize: "0.8rem", color: "#5e7188" }}>
                  {r.courseCode} — {r.courseName}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <div style={{ fontWeight: 600, color: "#2a7de1" }}>
                  <i className="fas fa-fire"></i> {r.voteCount} want this
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    router.push(`/scribe/upload?requestId=${r.id}&courseId=${r.courseId}`)
                  }
                >
                  Fulfill this
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

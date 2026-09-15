"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { SkeletonList } from "@/app/components/Skeleton";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";

interface FeedbackItem {
  id: string;
  message: string;
  createdAt: string;
  authorName: string;
  authorRole: string;
}

export default function AdminFeedbackPage() {
  const router = useRouter();
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
      return;
    }
    apiFetch("/api/feedback")
      .then((data) => setFeedback(data.feedback))
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
              <div className="logo-sub">Feedback inbox</div>
            </div>
          </div>
          <ProfileMenu />
        </div>

        <div style={{ marginTop: "1.5rem" }}>
          <h2>
            <i className="fas fa-comment-dots" style={{ color: "var(--text-info)" }}></i> What people are saying
          </h2>

          {loading ? (
            <SkeletonList rows={4} />
          ) : error ? (
            <p style={{ color: "var(--text-danger)", marginTop: "1rem" }}>{error}</p>
          ) : feedback.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", marginTop: "1rem" }}>No feedback yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem", marginTop: "1rem" }}>
              {feedback.map((f) => (
                <div
                  key={f.id}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border-blue)",
                    borderRadius: "12px",
                    padding: "1rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    <span>
                      {f.authorName} · {f.authorRole}
                    </span>
                    <span>{new Date(f.createdAt).toLocaleString()}</span>
                  </div>
                  <p style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap" }}>{f.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

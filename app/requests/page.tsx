"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { SkeletonList } from "@/app/components/Skeleton";
import { friendlyErrorMessage } from "@/lib/api-client";

interface CourseOption {
  id: string;
  name: string;
  code: string;
}
interface RequestView {
  id: string;
  requestedTitle: string;
  courseCode: string;
  courseName: string;
  voteCount: number;
  requestedByMe: boolean;
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "0.6rem",
  marginTop: "0.4rem",
  borderRadius: "0.7rem",
  border: "1px solid var(--border-blue)",
};

export default function RequestsPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [courseMode, setCourseMode] = useState<"existing" | "new">("existing");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseCode, setNewCourseCode] = useState("");
  const [requestedTitle, setRequestedTitle] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<RequestView[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
      return;
    }

    fetch("/api/scribe/courses")
      .then((res) => res.json())
      .then((data) => {
        setCourses(data.courses || []);
        if (!data.courses || data.courses.length === 0) setCourseMode("new");
      });

    loadFeed();
  }, [router]);

  async function loadFeed() {
    setLoadingFeed(true);
    try {
      const res = await fetch("/api/requests");
      const data = await res.json();
      setRequests(data.requests || []);
    } finally {
      setLoadingFeed(false);
    }
  }

  async function resolveCourseId(): Promise<string | null> {
    if (courseMode === "existing") {
      if (!selectedCourseId) {
        setError("Select a course.");
        return null;
      }
      return selectedCourseId;
    }

    if (!newCourseName.trim() || !newCourseCode.trim()) {
      setError("Enter both a course name and a course code.");
      return null;
    }

    const res = await fetch("/api/scribe/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCourseName.trim(), code: newCourseCode.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not create course");
      return null;
    }
    return data.course.id;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!requestedTitle.trim()) {
      setError("Describe what you want covered.");
      return;
    }

    setSubmitting(true);
    try {
      const courseId = await resolveCourseId();
      if (!courseId) return;

      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, requestedTitle: requestedTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not submit request");

      setMessage(`Request submitted — ${data.request.voteCount} student${data.request.voteCount === 1 ? "" : "s"} want this now.`);
      setRequestedTitle("");
      loadFeed();
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

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
              <div className="logo-sub">Request a block</div>
            </div>
          </div>
          <ProfileMenu />
        </div>

        <div style={{ marginTop: "1.5rem", maxWidth: 480 }}>
          <h2>
            <i className="fas fa-hand-point-up" style={{ color: "var(--text-info)" }}></i> What do you need?
          </h2>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
            {courses.length > 0 && (
              <div style={{ display: "flex", gap: "0.6rem" }}>
                <button
                  type="button"
                  className={`btn ${courseMode === "existing" ? "btn-primary" : ""}`}
                  onClick={() => setCourseMode("existing")}
                >
                  Existing course
                </button>
                <button
                  type="button"
                  className={`btn ${courseMode === "new" ? "btn-primary" : ""}`}
                  onClick={() => setCourseMode("new")}
                >
                  New course
                </button>
              </div>
            )}

            {courseMode === "existing" ? (
              <select value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)} style={inputStyle}>
                <option value="">Select a course...</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
                <input
                  type="text"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  placeholder="Course name"
                  style={inputStyle}
                />
                <input
                  type="text"
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value)}
                  placeholder="Course code, e.g. COS 201"
                  style={inputStyle}
                />
              </div>
            )}

            <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>
              What do you want covered?
              <input
                type="text"
                value={requestedTitle}
                onChange={(e) => setRequestedTitle(e.target.value)}
                placeholder="e.g. Recursion and backtracking"
                style={inputStyle}
              />
            </label>

            {error && <div className="auth-error">{error}</div>}
            {message && <p style={{ color: "var(--text-success)" }}>{message}</p>}

            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit request"}
            </button>
          </form>
        </div>

        <div style={{ marginTop: "2rem" }}>
          <h2>
            <i className="fas fa-fire" style={{ color: "var(--text-info)" }}></i> Open requests
          </h2>
          {loadingFeed && <SkeletonList rows={3} />}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem", marginTop: "0.8rem" }}>
            {requests.map((r) => (
              <div
                key={r.id}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border-blue)",
                  borderRadius: "1rem",
                  padding: "0.9rem 1.1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong>{r.requestedTitle}</strong>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    {r.courseCode} — {r.courseName}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 600, color: "var(--text-info)" }}>{r.voteCount} want this</div>
                  {r.requestedByMe && <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>You requested this</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

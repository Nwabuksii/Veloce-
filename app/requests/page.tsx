"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import PageHeader from "@/app/components/PageHeader";
import { SkeletonList } from "@/app/components/Skeleton";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";

interface CourseOption {
  id: string;
  name: string;
  code: string;
  departmentId?: string;
  departmentName?: string;
}
interface DepartmentOption {
  id: string;
  name: string;
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
  borderRadius: "8px",
  border: "1px solid var(--border-blue)",
};

export default function RequestsPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [courseMode, setCourseMode] = useState<"existing" | "new">("existing");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [newCourseDepartmentId, setNewCourseDepartmentId] = useState("");
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseCode, setNewCourseCode] = useState("");
  const [requestedTitle, setRequestedTitle] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<RequestView[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
      return;
    }

    fetch("/api/departments")
      .then((res) => res.json())
      .then((data) => setDepartments(data.departments || []));

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

  async function handleToggleVote(requestId: string, currentlyRequested: boolean) {
    setToggling(requestId);
    // Optimistic update — flip it immediately, same as the Follow button.
    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? { ...r, requestedByMe: !currentlyRequested, voteCount: r.voteCount + (currentlyRequested ? -1 : 1) }
          : r
      )
    );
    try {
      const data = await apiFetch<{ requestedByMe: boolean; voteCount: number }>(`/api/requests/${requestId}/vote`, {
        method: "POST",
      });
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, requestedByMe: data.requestedByMe, voteCount: data.voteCount } : r))
      );
    } catch (err) {
      // Roll back on failure.
      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? { ...r, requestedByMe: currentlyRequested, voteCount: r.voteCount + (currentlyRequested ? 1 : -1) }
            : r
        )
      );
      toast.error(friendlyErrorMessage(err));
    } finally {
      setToggling(null);
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

    if (!newCourseDepartmentId) {
      setError("Choose the department for this course.");
      return null;
    }

    if (!newCourseName.trim() || !newCourseCode.trim()) {
      setError("Enter both a course name and a course code.");
      return null;
    }

    const res = await fetch("/api/scribe/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCourseName.trim(), code: newCourseCode.trim(), departmentId: newCourseDepartmentId }),
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
        <PageHeader title="Request a block" subtitle="Ask scribes to cover something that isn't in the catalog.">
          <button className="btn" onClick={() => router.push("/requests/mine")}>
            <i className="fas fa-list"></i> My requests
          </button>
        </PageHeader>

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
                <select value={newCourseDepartmentId} onChange={(e) => setNewCourseDepartmentId(e.target.value)} style={inputStyle}>
                  <option value="">Select a department/course area...</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
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

          <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem", marginTop: "0.8rem" }}>
            {requests.map((r) => (
              <div key={r.id} className="ledger-row" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <span className="seal mono" style={{ marginBottom: "0.4rem", display: "inline-block" }}>{r.courseCode}</span>
                  <div className="ledger-row-title">{r.requestedTitle}</div>
                  <div className="ledger-row-meta">{r.courseName}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <button
                    className="pill pill-info"
                    style={{ border: "none", cursor: "pointer" }}
                    onClick={() => handleToggleVote(r.id, r.requestedByMe)}
                    disabled={toggling === r.id}
                  >
                    <i className="fas fa-thumbs-up" style={{ marginRight: "0.35rem" }}></i>
                    {r.voteCount} want this
                  </button>
                  {r.requestedByMe && <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.35rem" }}>You requested this</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

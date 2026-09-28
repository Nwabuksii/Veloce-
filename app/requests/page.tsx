"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import { SkeletonList } from "@/app/components/Skeleton";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { Icon } from "@/app/components/icons";

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

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

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
      body: JSON.stringify({
        name: newCourseName.trim(),
        code: newCourseCode.trim(),
        departmentId: newCourseDepartmentId,
      }),
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
      await loadFeed();
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-wrap student-page">
      <div className="app-container student-app-container">
        <section className="page-view is-active">
          <div className="page-header">
            <div className="page-header-left">
              <span className="eyebrow">Demand Feed</span>
              <h1>
                Request a <span className="serif">block</span>
              </h1>
              <p>
                Ask scribes to cover something that isn't in the catalog. Students who vote get the fulfilled note at a discounted price.
              </p>
            </div>
            <div className="page-header-right">
              <div className="header-actions">
                <button className="btn btn-ghost" onClick={() => router.push("/requests/mine")}>
                  {Icon.list()} My requests
                </button>
              </div>
            </div>
          </div>

          <div className="two-col">
            <div className="panel">
              <h2 className="panel-title">
                {Icon.plus()} What do you need?
              </h2>
              <p className="panel-desc">
                Pick the course block, describe what you need covered, and submit. Other students can vote and scribes can see the demand.
              </p>

              <form onSubmit={handleSubmit}>
                {courses.length > 0 && (
                  <div className="form-field">
                    <label className="form-label">Course source</label>
                    <div className="tabs" style={{ width: "fit-content" }}>
                      <button
                        type="button"
                        className={`tab${courseMode === "existing" ? " is-active" : ""}`}
                        onClick={() => setCourseMode("existing")}
                      >
                        Existing course
                      </button>
                      <button
                        type="button"
                        className={`tab${courseMode === "new" ? " is-active" : ""}`}
                        onClick={() => setCourseMode("new")}
                      >
                        New course
                      </button>
                    </div>
                  </div>
                )}

                {courseMode === "existing" ? (
                  <div className="form-field">
                    <label className="form-label">Course block</label>
                    <select className="select" value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)}>
                      <option value="">Select a course…</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div className="form-field">
                      <label className="form-label">Department / course area</label>
                      <select className="select" value={newCourseDepartmentId} onChange={(e) => setNewCourseDepartmentId(e.target.value)}>
                        <option value="">Select a department…</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-field">
                      <label className="form-label">Course name</label>
                      <input className="input" value={newCourseName} onChange={(e) => setNewCourseName(e.target.value)} placeholder="e.g. Operating Systems" />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Course code</label>
                      <input className="input" value={newCourseCode} onChange={(e) => setNewCourseCode(e.target.value)} placeholder="e.g. COS 201" />
                    </div>
                  </>
                )}

                <div className="form-field">
                  <label className="form-label">What do you want covered?</label>
                  <input
                    className="input"
                    value={requestedTitle}
                    onChange={(e) => setRequestedTitle(e.target.value)}
                    placeholder="e.g. Recursion and backtracking"
                    maxLength={120}
                  />
                </div>

                {error && <div className="auth-error">{error}</div>}
                {message && <div className="callout" style={{ background: "var(--bg-success)", borderColor: "var(--wallet-border)", color: "var(--text-success)" }}>{message}</div>}

                <div className="flex-end">
                  <button type="button" className="btn btn-quiet" onClick={() => { setRequestedTitle(""); setError(""); setMessage(""); }}>
                    Clear
                  </button>
                  <button className="btn btn-primary" type="submit" disabled={submitting}>
                    {submitting ? "Submitting…" : "Submit request"} {Icon.arrow()}
                  </button>
                </div>
              </form>
            </div>

            <div>
              <h2 className="panel-title" style={{ marginBottom: 6 }}>
                {Icon.up()} Open requests <span className="badge">{requests.length}</span>
              </h2>
              <p className="panel-desc">Vote on what matters. Popular requests help scribes prioritize what to cover.</p>

              {loadingFeed && <SkeletonList rows={3} />}
              {!loadingFeed && requests.length === 0 && (
                <div className="empty-state" style={{ padding: "40px 20px" }}>
                  <div className="empty-icon">{Icon.up()}</div>
                  <h3 className="empty-title">No open requests</h3>
                  <p className="empty-desc">Be the first student to ask for a block.</p>
                </div>
              )}

              {!loadingFeed && requests.length > 0 && (
                <div className="request-list">
                  {requests.map((r) => (
                    <div key={r.id} className="request-item">
                      <button
                        type="button"
                        className={`vote-block${r.requestedByMe ? " voted" : ""}`}
                        onClick={() => handleToggleVote(r.id, r.requestedByMe)}
                        disabled={toggling === r.id}
                        aria-label={r.requestedByMe ? `Remove vote from ${r.requestedTitle}` : `Vote for ${r.requestedTitle}`}
                      >
                        {Icon.up()}
                        <span className="count">{r.voteCount}</span>
                      </button>
                      <div className="request-body">
                        <div className="request-code">{r.courseCode}</div>
                        <div className="request-topic">{r.requestedTitle}</div>
                        <div className="request-meta">
                          <span>{Icon.book()} {r.courseName}</span>
                          {r.requestedByMe && <span>{Icon.check()} You voted</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

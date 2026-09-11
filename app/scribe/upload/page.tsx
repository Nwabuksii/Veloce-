"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import { friendlyErrorMessage } from "@/lib/api-client";

interface CourseOption {
  id: string;
  name: string;
  code: string;
}
interface BlockOption {
  id: string;
  title: string;
}
interface RequestOption {
  id: string;
  requestedTitle: string;
  voteCount: number;
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "0.6rem",
  marginTop: "0.4rem",
  borderRadius: "0.7rem",
  border: "1px solid var(--border-blue)",
};

// This page reads ?requestId=/?courseId= to support the "Fulfill this"
// one-click flow from the discovery feed — needs dynamic rendering so
// a production build doesn't try to statically prerender it.
export const dynamic = "force-dynamic";

export default function ScribeUploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState("");

  // Step 1 — course
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [courseMode, setCourseMode] = useState<"existing" | "new">("existing");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseCode, setNewCourseCode] = useState("");
  const [resolvedCourseId, setResolvedCourseId] = useState("");
  const [resolvedCourseLabel, setResolvedCourseLabel] = useState("");

  // Step 2 — block + topics
  const [blocks, setBlocks] = useState<BlockOption[]>([]);
  const [blockMode, setBlockMode] = useState<"existing" | "new">("new");
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [newBlockTitle, setNewBlockTitle] = useState("");
  const [topics, setTopics] = useState<string[]>(["", "", ""]);
  const [resolvedBlockId, setResolvedBlockId] = useState("");
  const [openRequests, setOpenRequests] = useState<RequestOption[]>([]);
  const [fulfillsRequestId, setFulfillsRequestId] = useState("");

  // Step 3 — file
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

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

    const prefillRequestId = searchParams.get("requestId");
    const prefillCourseId = searchParams.get("courseId");

    fetch("/api/scribe/courses")
      .then((res) => res.json())
      .then(async (data) => {
        const list: CourseOption[] = data.courses || [];
        setCourses(list);

        if (prefillCourseId) {
          const course = list.find((c) => c.id === prefillCourseId);
          setResolvedCourseId(prefillCourseId);
          setResolvedCourseLabel(course ? `${course.code} — ${course.name}` : "");
          await loadBlocks(prefillCourseId);

          const reqRes = await fetch(`/api/requests?courseId=${prefillCourseId}`);
          const reqData = await reqRes.json();
          const requests: RequestOption[] = reqData.requests || [];
          setOpenRequests(requests);
          setBlockMode("new");

          if (prefillRequestId) {
            setFulfillsRequestId(prefillRequestId);
            const matched = requests.find((r) => r.id === prefillRequestId);
            if (matched) setNewBlockTitle(matched.requestedTitle);
          }
          setStep(2);
        } else if (list.length === 0) {
          setCourseMode("new");
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function loadBlocks(courseId: string) {
    const res = await fetch(`/api/scribe/blocks?courseId=${courseId}`);
    const data = await res.json();
    setBlocks(data.blocks || []);
    setBlockMode(data.blocks && data.blocks.length > 0 ? "existing" : "new");
  }

  async function loadOpenRequests(courseId: string) {
    try {
      const res = await fetch(`/api/requests?courseId=${courseId}`);
      const data = await res.json();
      setOpenRequests(data.requests || []);
    } catch {
      setOpenRequests([]);
    }
    setFulfillsRequestId("");
  }

  async function handleCourseNext() {
    setError("");

    if (courseMode === "existing") {
      if (!selectedCourseId) {
        setError("Select a course.");
        return;
      }
      const course = courses.find((c) => c.id === selectedCourseId);
      setResolvedCourseId(selectedCourseId);
      setResolvedCourseLabel(course ? `${course.code} — ${course.name}` : "");
      await loadBlocks(selectedCourseId);
      await loadOpenRequests(selectedCourseId);
      setStep(2);
      return;
    }

    if (!newCourseName.trim() || !newCourseCode.trim()) {
      setError("Enter both a course name and a course code.");
      return;
    }

    try {
      const res = await fetch("/api/scribe/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCourseName.trim(), code: newCourseCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create course");

      setResolvedCourseId(data.course.id);
      setResolvedCourseLabel(`${data.course.code} — ${data.course.name}`);
      setBlocks([]);
      setBlockMode("new");
      await loadOpenRequests(data.course.id);
      setStep(2);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    }
  }

  function updateTopic(index: number, value: string) {
    setTopics((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  function addTopicField() {
    setTopics((prev) => [...prev, ""]);
  }

  function removeTopicField(index: number) {
    setTopics((prev) => (prev.length > 3 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleBlockNext() {
    setError("");

    if (blockMode === "existing") {
      if (!selectedBlockId) {
        setError("Select an existing set of notes.");
        return;
      }
      setResolvedBlockId(selectedBlockId);
      setStep(3);
      return;
    }

    if (!newBlockTitle.trim()) {
      setError("Give these notes a title.");
      return;
    }
    const cleanTopics = topics.map((t) => t.trim()).filter(Boolean);
    if (cleanTopics.length < 3) {
      setError("Add at least 3 topics for these notes.");
      return;
    }

    try {
      const res = await fetch("/api/scribe/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: resolvedCourseId,
          title: newBlockTitle.trim(),
          topics: cleanTopics,
          fulfillsRequestId: fulfillsRequestId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.formErrors?.[0] || data.error || "Could not save these notes");

      setResolvedBlockId(data.block.id);
      setStep(3);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file || !resolvedBlockId) return;

    setStatus("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("blockId", resolvedBlockId);
      formData.append("file", file);

      const res = await fetch("/api/scribe/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Upload failed");
        return;
      }
      setStatus(data.message);
    } catch {
      setStatus("Something went wrong uploading. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-wrap">
      <div className="app-container" style={{ maxWidth: 620 }}>
        <div className="top-bar">
          <div className="logo" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Logo size={34} />
            <div>
              <h1>
                Veloce <span className="accent">.</span>
              </h1>
              <div className="logo-sub">Upload notes · step {step} of 3</div>
            </div>
          </div>
          <button className="btn" onClick={() => router.push("/scribe/workspace")}>
            <i className="fas fa-arrow-left"></i> Workspace
          </button>
        </div>

        {error && (
          <div className="auth-error" style={{ marginTop: "1rem" }}>
            {error}
          </div>
        )}

        {step === 1 && (
          <div style={{ marginTop: "1.5rem" }}>
            <h2>
              <i className="fas fa-book" style={{ color: "var(--text-info)" }}></i> Which course?
            </h2>

            {courses.length > 0 && (
              <div style={{ display: "flex", gap: "0.6rem", margin: "1rem 0" }}>
                <button
                  className={`btn ${courseMode === "existing" ? "btn-primary" : ""}`}
                  onClick={() => setCourseMode("existing")}
                >
                  Choose existing
                </button>
                <button className={`btn ${courseMode === "new" ? "btn-primary" : ""}`} onClick={() => setCourseMode("new")}>
                  Create new
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
                <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                  Course name
                  <input
                    type="text"
                    value={newCourseName}
                    onChange={(e) => setNewCourseName(e.target.value)}
                    placeholder="e.g. Intro to Programming"
                    style={inputStyle}
                  />
                </label>
                <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                  Course code
                  <input
                    type="text"
                    value={newCourseCode}
                    onChange={(e) => setNewCourseCode(e.target.value)}
                    placeholder="e.g. COS 201"
                    style={inputStyle}
                  />
                </label>
              </div>
            )}

            <button className="btn btn-primary" style={{ marginTop: "1.2rem" }} onClick={handleCourseNext}>
              Continue <i className="fas fa-arrow-right"></i>
            </button>
          </div>
        )}

        {step === 2 && (
          <div style={{ marginTop: "1.5rem" }}>
            <h2>
              <i className="fas fa-layer-group" style={{ color: "var(--text-info)" }}></i> Which notes are these?
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.3rem" }}>{resolvedCourseLabel}</p>

            {blocks.length > 0 && (
              <div style={{ display: "flex", gap: "0.6rem", margin: "1rem 0" }}>
                <button
                  className={`btn ${blockMode === "existing" ? "btn-primary" : ""}`}
                  onClick={() => setBlockMode("existing")}
                >
                  Choose existing
                </button>
                <button className={`btn ${blockMode === "new" ? "btn-primary" : ""}`} onClick={() => setBlockMode("new")}>
                  Create new
                </button>
              </div>
            )}

            {blockMode === "existing" ? (
              <select value={selectedBlockId} onChange={(e) => setSelectedBlockId(e.target.value)} style={inputStyle}>
                <option value="">Select existing notes...</option>
                {blocks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                  Notes title
                  <input
                    type="text"
                    value={newBlockTitle}
                    onChange={(e) => setNewBlockTitle(e.target.value)}
                    placeholder="Name these notes anything you like"
                    style={inputStyle}
                  />
                </label>

                {openRequests.length > 0 && (
                  <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                    Fulfill an open request? (optional — buyers who asked for it get a discount)
                    <select
                      value={fulfillsRequestId}
                      onChange={(e) => setFulfillsRequestId(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">Don&apos;t link to a request</option>
                      {openRequests.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.requestedTitle} · {r.voteCount} want this
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.4rem" }}>
                    Topics covered (at least 3)
                  </div>
                  {topics.map((t, i) => (
                    <div key={i} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <input
                        type="text"
                        value={t}
                        onChange={(e) => updateTopic(i, e.target.value)}
                        placeholder={`Topic ${i + 1}`}
                        style={{ flex: 1, padding: "0.6rem", borderRadius: "0.7rem", border: "1px solid var(--border-blue)" }}
                      />
                      {topics.length > 3 && (
                        <button type="button" className="btn" onClick={() => removeTopicField(i)}>
                          <i className="fas fa-times"></i>
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="btn" onClick={addTopicField}>
                    <i className="fas fa-plus"></i> Add topic
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: "0.6rem", marginTop: "1.2rem" }}>
              <button className="btn" onClick={() => setStep(1)}>
                <i className="fas fa-arrow-left"></i> Back
              </button>
              <button className="btn btn-primary" onClick={handleBlockNext}>
                Continue <i className="fas fa-arrow-right"></i>
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ marginTop: "1.5rem" }}>
            <h2>
              <i className="fas fa-cloud-upload-alt" style={{ color: "var(--text-info)" }}></i> Upload your PDF
            </h2>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
              <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} required />

              {status && <p style={{ color: "var(--text-secondary)" }}>{status}</p>}

              <div style={{ display: "flex", gap: "0.6rem" }}>
                <button type="button" className="btn" onClick={() => setStep(2)}>
                  <i className="fas fa-arrow-left"></i> Back
                </button>
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  {loading ? "Uploading..." : "Upload"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

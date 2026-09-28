"use client";

import { useEffect, useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import { friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import PageHeader from "@/app/components/PageHeader";
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
interface BlockOption {
  id: string;
  title: string;
}
interface RequestOption {
  id: string;
  requestedTitle: string;
  voteCount: number;
}

// This page reads ?requestId=/?courseId= to support the "Fulfill this"
// one-click flow from the discovery feed — needs dynamic rendering so
// a production build doesn't try to statically prerender it.
export const dynamic = "force-dynamic";

// useSearchParams() opts the whole tree into client-side rendering during
// prerendering, and Next requires a Suspense boundary around whatever uses
// it — force-dynamic alone doesn't satisfy that during the build. The
// actual page logic lives in ScribeUploadForm below; this default export
// just supplies the required boundary around it.
export default function ScribeUploadPage() {
  return (
    <Suspense fallback={null}>
      <ScribeUploadForm />
    </Suspense>
  );
}

function ScribeUploadForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState("");

  // Step 1 — course
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [courseMode, setCourseMode] = useState<"existing" | "new">("existing");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [newCourseDepartmentId, setNewCourseDepartmentId] = useState("");
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
  const [attested, setAttested] = useState(false);
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

    fetch("/api/departments")
      .then((res) => res.json())
      .then((data) => setDepartments(data.departments || []));

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

    if (!newCourseDepartmentId) {
      setError("Choose the department for this course.");
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
        body: JSON.stringify({ name: newCourseName.trim(), code: newCourseCode.trim(), departmentId: newCourseDepartmentId }),
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
    if (!file || !resolvedBlockId || !attested) return;

    setStatus("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("blockId", resolvedBlockId);
      formData.append("file", file);
      formData.append("attestedOriginal", "true");

      const res = await fetch("/api/scribe/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Upload failed");
        setLoading(false);
        return;
      }

      // Redirect straight back to the workspace on success so the scribe
      // can't hit Upload again on the same file/block — leaving them on
      // this page invited exactly that (accidental duplicate uploads).
      toast.success(data.message || "Uploaded!");
      router.push("/scribe/workspace");
    } catch {
      setStatus("Something went wrong uploading. Try again.");
      setLoading(false);
    }
  }

  const resolvedBlockTitle =
    blockMode === "existing"
      ? blocks.find((b) => b.id === resolvedBlockId)?.title ?? ""
      : newBlockTitle.trim();

  function formatSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const STEP_LABELS = ["Course", "Notes", "File"];

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Scribe · Publish"
        title="Upload"
        accent="notes"
        subtitle="Three quick steps. Your notes go to moderation, then live in the catalogue."
      >
        <button className="btn btn-ghost" onClick={() => router.push("/scribe/workspace")}>
          {Icon.back()} Workspace
        </button>
      </PageHeader>

      <div className="panel page-medium">
        <div className="wizard-steps">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            return (
              <div key={label} style={{ display: "contents" }}>
                {i > 0 && <div className="wline" />}
                <div className={`wstep${n === step ? " is-active" : ""}${n < step ? " is-done" : ""}`}>
                  <span className="num">{n < step ? Icon.check() : n}</span> {label}
                </div>
              </div>
            );
          })}
        </div>

        {error && <div className="auth-error" style={{ marginBottom: 16 }}>{error}</div>}

        {step === 1 && (
          <div>
            <h2 className="panel-title">{Icon.book()} Which course is this for?</h2>
            <p className="panel-desc">Pick an existing course, or create one if yours isn&apos;t listed.</p>

            {courses.length > 0 && (
              <div className="seg">
                <button
                  type="button"
                  className={`btn btn-sm ${courseMode === "existing" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setCourseMode("existing")}
                >
                  Choose existing
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${courseMode === "new" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setCourseMode("new")}
                >
                  Create new
                </button>
              </div>
            )}

            {courseMode === "existing" ? (
              <div className="form-field">
                <label className="form-label" htmlFor="course">Course</label>
                <select id="course" className="select" value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)}>
                  <option value="">Select a course...</option>
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
                  <label className="form-label" htmlFor="dept">Department</label>
                  <select id="dept" className="select" value={newCourseDepartmentId} onChange={(e) => setNewCourseDepartmentId(e.target.value)}>
                    <option value="">Select a department/course area...</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="cname">Course name</label>
                  <input id="cname" className="input" type="text" value={newCourseName} onChange={(e) => setNewCourseName(e.target.value)} placeholder="e.g. Intro to Programming" />
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="ccode">Course code</label>
                  <input id="ccode" className="input" type="text" value={newCourseCode} onChange={(e) => setNewCourseCode(e.target.value)} placeholder="e.g. COS 201" />
                </div>
              </>
            )}

            <div className="flex-end">
              <button className="btn btn-primary" onClick={handleCourseNext}>
                Continue {Icon.arrow()}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="panel-title">{Icon.workshop()} Which notes are these?</h2>
            <p className="panel-desc">{resolvedCourseLabel}</p>

            {blocks.length > 0 && (
              <div className="seg">
                <button
                  type="button"
                  className={`btn btn-sm ${blockMode === "existing" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setBlockMode("existing")}
                >
                  Choose existing
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${blockMode === "new" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setBlockMode("new")}
                >
                  Create new
                </button>
              </div>
            )}

            {blockMode === "existing" ? (
              <div className="form-field">
                <label className="form-label" htmlFor="block">Existing notes</label>
                <select id="block" className="select" value={selectedBlockId} onChange={(e) => setSelectedBlockId(e.target.value)}>
                  <option value="">Select existing notes...</option>
                  {blocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div className="form-field">
                  <label className="form-label" htmlFor="btitle">Notes title</label>
                  <input id="btitle" className="input" type="text" value={newBlockTitle} onChange={(e) => setNewBlockTitle(e.target.value)} placeholder="Name these notes anything you like" />
                </div>

                {openRequests.length > 0 && (
                  <div className="form-field">
                    <label className="form-label" htmlFor="fulfil">Fulfil an open request? (optional)</label>
                    <select id="fulfil" className="select" value={fulfillsRequestId} onChange={(e) => setFulfillsRequestId(e.target.value)}>
                      <option value="">Don&apos;t link to a request</option>
                      {openRequests.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.requestedTitle} · {r.voteCount} want this
                        </option>
                      ))}
                    </select>
                    <p className="panel-desc" style={{ margin: "8px 0 0" }}>Buyers who asked for it get a discount.</p>
                  </div>
                )}

                <div className="form-field">
                  <div className="form-label">Topics covered (at least 3)</div>
                  <div className="stack-10">
                    {topics.map((t, i) => (
                      <div key={i} className="topic-row">
                        <input className="input" type="text" value={t} onChange={(e) => updateTopic(i, e.target.value)} placeholder={`Topic ${i + 1}`} />
                        {topics.length > 3 && (
                          <button type="button" className="btn btn-ghost" aria-label={`Remove topic ${i + 1}`} onClick={() => removeTopicField(i)}>
                            {Icon.x()}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 10 }} onClick={addTopicField}>
                    {Icon.plus()} Add topic
                  </button>
                </div>
              </>
            )}

            <div className="flex-end is-split">
              <button className="btn btn-quiet" onClick={() => setStep(1)}>
                {Icon.back()} Back
              </button>
              <button className="btn btn-primary" onClick={handleBlockNext}>
                Continue {Icon.arrow()}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <form onSubmit={handleSubmit}>
            <h2 className="panel-title">{Icon.upload()} Upload the file</h2>
            <p className="panel-desc">PDF only. It&apos;s watermarked per-buyer automatically when they read it.</p>

            <div className="upload-zone">
              <input type="file" accept="application/pdf" aria-label="Choose a PDF" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <div className="up-icon">{Icon.upload()}</div>
              <div className="up-title">{file ? file.name : "Drop your PDF here"}</div>
              <div className="up-desc">{file ? `${formatSize(file.size)} — click to choose a different file` : "or click to browse — PDF only"}</div>
            </div>

            <div className="info-list" style={{ marginTop: 18 }}>
              <div className="info-row">
                <span className="k">Course</span>
                <span className="v">{resolvedCourseLabel || "—"}</span>
              </div>
              <div className="info-row">
                <span className="k">Notes</span>
                <span className="v">{resolvedBlockTitle || "—"}</span>
              </div>
            </div>

            <label className="check-row" style={{ marginTop: 18 }}>
              <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} required />
              <span>
                I confirm these are my own original notes, taken from attending this lecture myself — not copied from
                slides, a textbook, or another student&apos;s work.
              </span>
            </label>

            {status && <div className="auth-error" style={{ marginTop: 14 }}>{status}</div>}

            <div className="flex-end is-split">
              <button type="button" className="btn btn-quiet" onClick={() => setStep(2)}>
                {Icon.back()} Back
              </button>
              <button className="btn btn-primary" type="submit" disabled={loading || !attested || !file}>
                {loading ? "Uploading..." : <>Upload for review {Icon.check()}</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

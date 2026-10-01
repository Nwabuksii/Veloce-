"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import AdminPageHeader from "@/app/components/AdminPageHeader";
import { AIcon } from "@/app/components/AdminIcons";
import { SkeletonList } from "@/app/components/Skeleton";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { formatDateDDMMYYYY } from "@/lib/date-format";

interface Side {
  id: string;
  status: string;
  pageCount: number | null;
  uploadedAt: string;
  courseCode: string;
  title: string;
  scribeName: string;
  hasText: boolean;
  segments: Array<{ text: string; shared: boolean }>;
}

interface Comparison {
  similarity: number;
  sharedSentences: number;
  a: Side;
  b: Side;
}

// One note's column: its facts, then either its text (matching sentences
// highlighted) or its page images, flipped one page at a time.
function NotePane({ side, label, view }: { side: Side; label: string; view: "text" | "pages" }) {
  const [images, setImages] = useState<string[] | null>(null);
  const [page, setPage] = useState(1);
  const [pagesError, setPagesError] = useState("");

  useEffect(() => {
    if (view !== "pages" || images) return;
    apiFetch(`/api/notes/${side.id}/all-pages`)
      .then((data) => setImages(data.images ?? []))
      .catch((err) => setPagesError(friendlyErrorMessage(err)));
  }, [view, images, side.id]);

  return (
    <div className="panel" style={{ minWidth: 0 }}>
      <div className="request-code">{label}</div>
      <h3 style={{ margin: "2px 0" }}>
        {side.courseCode} — {side.title}
      </h3>
      <p className="panel-desc" style={{ marginTop: 0 }}>
        {side.scribeName} · {formatDateDDMMYYYY(new Date(side.uploadedAt))}
        {side.pageCount ? ` · ${side.pageCount} pages` : ""} · {side.status.toLowerCase()}
      </p>

      {view === "text" &&
        (side.hasText ? (
          <div style={{ maxHeight: "70vh", overflowY: "auto", fontSize: "0.85rem", lineHeight: 1.6 }}>
            {side.segments.map((seg, i) => (
              <span key={i} style={seg.shared ? { background: "var(--bg-warning)", color: "var(--text-warning)", borderRadius: 3, padding: "0 2px" } : undefined}>
                {seg.text}{" "}
              </span>
            ))}
          </div>
        ) : (
          <p className="panel-desc">No readable text in this PDF (likely scanned or handwritten). Use the Pages view.</p>
        ))}

      {view === "pages" && (
        <div>
          {pagesError && <div className="auth-error">{pagesError}</div>}
          {!pagesError && !images && <SkeletonList rows={2} />}
          {images && images.length === 0 && <p className="panel-desc">No pages to show.</p>}
          {images && images.length > 0 && (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Prev
                </button>
                <span className="panel-desc" style={{ margin: 0 }}>
                  Page {page} of {images.length}
                </span>
                <button className="btn btn-sm btn-ghost" disabled={page >= images.length} onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={images[page - 1]} alt={`${side.title}, page ${page}`} style={{ width: "100%", height: "auto", borderRadius: 8 }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CompareInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const a = searchParams.get("a");
  const b = searchParams.get("b");

  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<"text" | "pages">("text");

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push("/login");
      return;
    }
    if (user.role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }
    if (!a || !b) {
      setError("Pick two notes to compare from the moderation queue.");
      return;
    }
    apiFetch(`/api/admin/notes/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`)
      .then(setData)
      .catch((err) => setError(friendlyErrorMessage(err)));
  }, [router, a, b]);

  return (
    <div className="page-wrap">
      <AdminPageHeader
        section="Quality"
        title="Compare"
        serif="notes"
        subtitle="Sentences that appear in both notes are highlighted in the text view."
      >
        <button className="btn btn-ghost" onClick={() => router.push("/admin/moderation")}>
          {AIcon.back()} Back to queue
        </button>
      </AdminPageHeader>

      {error && <div className="auth-error">{error}</div>}
      {!data && !error && <SkeletonList rows={3} />}

      {data && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
            <span className="status warn">{Math.round(data.similarity * 100)}% of the wording overlaps</span>
            <span className="panel-desc" style={{ margin: 0 }}>
              {data.sharedSentences} identical sentence{data.sharedSentences === 1 ? "" : "s"}
            </span>
            <span style={{ flex: 1 }} />
            <button className={`btn btn-sm ${view === "text" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("text")}>
              Text
            </button>
            <button className={`btn btn-sm ${view === "pages" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("pages")}>
              Pages
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
            <NotePane side={data.a} label="Waiting for review" view={view} />
            <NotePane side={data.b} label="Existing note" view={view} />
          </div>
        </>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={null}>
      <CompareInner />
    </Suspense>
  );
}

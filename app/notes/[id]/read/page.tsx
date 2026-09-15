"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";

// Deliberately the only way to view a note's actual content — there is no
// download link or raw-file route anymore. Every page image is rendered
// server-side with the current viewer's email/name watermarked into the
// pixels themselves (see /api/notes/[id]/page/[num]), so what shows here
// can't be "saved as a clean copy" through normal use of the page. The
// right-click/drag/long-press blocks below are a soft deterrent only — a
// real screenshot can never be stopped client-side; the watermark's real
// job is making a leaked copy traceable, not making leaking impossible.
export default function NoteReaderPage() {
  const router = useRouter();
  const params = useParams();
  const noteId = params.id as string;

  const [pageCount, setPageCount] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [imageLoading, setImageLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push(`/login?returnTo=${encodeURIComponent(`/notes/${noteId}/read`)}`);
      return;
    }

    apiFetch(`/api/notes/${noteId}/pages`)
      .then((data) => setPageCount(data.pageCount))
      .catch((err) => setError(friendlyErrorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, noteId]);

  function goTo(page: number) {
    if (!pageCount || page < 1 || page > pageCount) return;
    setImageLoading(true);
    setCurrentPage(page);
  }

  return (
    <div className="page-wrap">
      <div className="app-container" style={{ maxWidth: "100%" }}>
        <div className="top-bar">
          <div className="logo" style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Logo size={34} />
            <div>
              <h1>
                Veloce <span className="accent">.</span>
              </h1>
              <div className="logo-sub">Reading notes</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="btn" onClick={() => router.back()}>
              <i className="fas fa-arrow-left"></i> Back
            </button>
            <ProfileMenu />
          </div>
        </div>

        {error && <div className="auth-error" style={{ marginTop: "1rem" }}>{error}</div>}

        {!error && (
          <div style={{ marginTop: "1.2rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
            <div
              style={{
                width: "100%",
                background: "var(--surface)",
                border: "1px solid var(--border-blue)",
                borderRadius: "0.5rem",
                padding: "0.25rem",
                minHeight: 300,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              {imageLoading && (
                <span style={{ position: "absolute", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Loading page...</span>
              )}
              {pageCount && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/notes/${noteId}/page/${currentPage}`}
                  alt={`Page ${currentPage}`}
                  onLoad={() => setImageLoading(false)}
                  onError={() => {
                    setImageLoading(false);
                    setError("Couldn't load this page — try again.");
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                  draggable={false}
                  style={{
                    width: "100%",
                    height: "auto",
                    display: "block",
                    borderRadius: "0.3rem",
                    userSelect: "none",
                    WebkitTouchCallout: "none",
                    opacity: imageLoading ? 0 : 1,
                    transition: "opacity 0.15s",
                  } as React.CSSProperties}
                />
              )}
            </div>
          </div>
        )}

        {/* Fixed to the viewport (not the scrolling page) so these stay put
            and reachable no matter how far down the document you've scrolled. */}
        {!error && pageCount && (
          <>
            <button
              className="btn"
              onClick={() => goTo(currentPage - 1)}
              disabled={currentPage <= 1}
              aria-label="Previous page"
              style={{
                position: "fixed",
                left: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 40,
                width: "2.75rem",
                height: "2.75rem",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            >
              <i className="fas fa-chevron-left"></i>
            </button>
            <button
              className="btn"
              onClick={() => goTo(currentPage + 1)}
              disabled={currentPage >= pageCount}
              aria-label="Next page"
              style={{
                position: "fixed",
                right: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 40,
                width: "2.75rem",
                height: "2.75rem",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            >
              <i className="fas fa-chevron-right"></i>
            </button>
            <div
              style={{
                position: "fixed",
                bottom: "0.9rem",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 40,
                background: "var(--surface)",
                border: "1px solid var(--border-blue)",
                borderRadius: "999px",
                padding: "0.35rem 1rem",
                fontSize: "0.85rem",
                color: "var(--text-secondary)",
                boxShadow: "0 6px 16px -8px rgba(24,24,27,0.25)",
              }}
            >
              Page {currentPage} of {pageCount}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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
// The same protections apply identically in fullscreen mode — going
// fullscreen only changes layout, never loosens the anti-copy behavior.
const SWIPE_THRESHOLD_PX = 50;

export default function NoteReaderPage() {
  const router = useRouter();
  const params = useParams();
  const noteId = params.id as string;

  const [pageCount, setPageCount] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [imageLoading, setImageLoading] = useState(true);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const touchStartX = useRef<number | null>(null);

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

  const goTo = useCallback(
    (page: number) => {
      if (!pageCount || page < 1 || page > pageCount) return;
      setImageLoading(true);
      setCurrentPage(page);
    },
    [pageCount]
  );

  // Keyboard navigation — active whenever the reader is open, not just in
  // fullscreen, since a laptop user reading in the normal layout benefits
  // from arrow-key paging just as much.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goTo(currentPage + 1);
      else if (e.key === "ArrowLeft") goTo(currentPage - 1);
      else if (e.key === "Escape" && fullscreen) setFullscreen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentPage, goTo, fullscreen]);

  // Swipe navigation for mobile — a real "next page like normal" gesture,
  // not just tap-the-button. Left swipe = next page, right swipe = previous,
  // matching how every mobile reading app already behaves.
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(deltaX) > SWIPE_THRESHOLD_PX) {
      if (deltaX < 0) goTo(currentPage + 1);
      else goTo(currentPage - 1);
    }
    touchStartX.current = null;
  }

  const pageImage = pageCount && (
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
        maxWidth: "100%",
        maxHeight: fullscreen ? "100dvh" : undefined,
        objectFit: "contain",
        borderRadius: fullscreen ? 0 : "4px",
        userSelect: "none",
        WebkitTouchCallout: "none",
        opacity: imageLoading ? 0 : 1,
        transition: "opacity 0.15s",
      } as React.CSSProperties}
    />
  );

  if (fullscreen) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#000",
          zIndex: 200,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {imageLoading && <span style={{ position: "absolute", color: "#ddd", fontSize: "0.85rem" }}>Loading page...</span>}
          {pageImage}

          {/* Tap zones double as click targets for a mouse, invisible on touch */}
          <button
            aria-label="Previous page"
            onClick={() => goTo(currentPage - 1)}
            disabled={currentPage <= 1}
            style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "18%", background: "none", border: "none", cursor: currentPage > 1 ? "pointer" : "default" }}
          />
          <button
            aria-label="Next page"
            onClick={() => goTo(currentPage + 1)}
            disabled={!pageCount || currentPage >= pageCount}
            style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "18%", background: "none", border: "none", cursor: !pageCount || currentPage >= pageCount ? "default" : "pointer" }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.7rem 1rem",
            background: "#111",
          }}
        >
          <button className="btn" onClick={() => setFullscreen(false)} style={{ background: "#222", borderColor: "#333", color: "white" }}>
            <i className="fas fa-compress"></i> Exit
          </button>
          <span style={{ color: "#ccc", fontSize: "0.85rem" }}>
            Page {currentPage} of {pageCount ?? "—"}
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className="btn"
              onClick={() => goTo(currentPage - 1)}
              disabled={currentPage <= 1}
              style={{ background: "#222", borderColor: "#333", color: "white" }}
            >
              <i className="fas fa-chevron-left"></i>
            </button>
            <button
              className="btn"
              onClick={() => goTo(currentPage + 1)}
              disabled={!pageCount || currentPage >= pageCount}
              style={{ background: "#222", borderColor: "#333", color: "white" }}
            >
              <i className="fas fa-chevron-right"></i>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <div className="app-container" style={{ maxWidth: 720 }}>
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
                borderRadius: "4px",
                padding: "0.6rem",
                minHeight: 300,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {imageLoading && (
                <span style={{ position: "absolute", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Loading page...</span>
              )}
              {pageImage}

              {pageCount && (
                <button
                  className="btn"
                  onClick={() => setFullscreen(true)}
                  style={{ position: "absolute", top: "0.6rem", right: "0.6rem" }}
                  aria-label="View fullscreen"
                >
                  <i className="fas fa-expand"></i>
                </button>
              )}
            </div>

            {pageCount && (
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <button className="btn" onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1}>
                  <i className="fas fa-chevron-left"></i> Prev
                </button>
                <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                  Page {currentPage} of {pageCount}
                </span>
                <button className="btn" onClick={() => goTo(currentPage + 1)} disabled={currentPage >= pageCount}>
                  Next <i className="fas fa-chevron-right"></i>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

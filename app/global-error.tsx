"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Sentry flagged this as missing in the build log — without it, a crash
// during React rendering itself (not inside an API route, where every
// catch block already reports to Sentry manually) never gets reported at
// all. This is Next.js App Router's documented way to catch that class of
// error: global-error.tsx replaces the entire root layout when a truly
// fatal, unrecovered error occurs, so it has to render its own <html> and
// <body> rather than assuming app/layout.tsx is still around it.
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "sans-serif", background: "#F6F1E7", color: "#16213A" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
          <div style={{ textAlign: "center", maxWidth: 420 }}>
            <h1 style={{ fontSize: "1.4rem", marginBottom: "0.6rem" }}>Something went wrong</h1>
            <p style={{ color: "#6B6252", marginBottom: "1.2rem" }}>
              This has been reported automatically. Try reloading the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "#16213A",
                color: "white",
                border: "none",
                borderRadius: "10px",
                padding: "0.6rem 1.4rem",
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

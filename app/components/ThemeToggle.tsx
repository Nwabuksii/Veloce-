"use client";

import { useEffect, useState } from "react";
import { getStoredTheme, applyTheme, Theme } from "@/lib/theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getStoredTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  if (!mounted) {
    // Avoid a flash of an incorrect toggle state before hydration reads localStorage.
    return <div style={{ height: "2rem" }} />;
  }

  const isDark = theme === "dark";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.9rem 1.1rem",
        border: "1px solid var(--border-light)",
        borderRadius: "0.8rem",
        background: "var(--surface)",
      }}
    >
      <div>
        <div style={{ fontWeight: 500, fontSize: "0.9rem", color: "var(--text-primary)" }}>Dark mode</div>
        <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
          A darker, high-contrast look across the whole app.
        </div>
      </div>
      <button
        role="switch"
        aria-checked={isDark}
        aria-label="Toggle dark mode"
        onClick={toggle}
        className="press-on-tap"
        style={{
          width: "3rem",
          height: "1.7rem",
          borderRadius: "999px",
          border: "1px solid var(--border)",
          background: isDark ? "var(--accent)" : "var(--stone-light)",
          position: "relative",
          cursor: "pointer",
          flexShrink: 0,
          transition: "background 0.18s ease",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "2px",
            left: isDark ? "calc(100% - 1.4rem - 2px)" : "2px",
            width: "1.4rem",
            height: "1.4rem",
            borderRadius: "50%",
            background: "white",
            transition: "left 0.18s ease",
            boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
          }}
        />
      </button>
    </div>
  );
}

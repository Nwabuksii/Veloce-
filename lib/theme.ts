export type Theme = "light" | "dark";

const STORAGE_KEY = "veloce-theme";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem(STORAGE_KEY, theme);
}

/**
 * Persists the theme to the user's profile server-side, so it follows
 * them to any device/browser they log into next — localStorage alone is
 * per-browser only. Best-effort: if this fails (e.g. offline), the local
 * change still applies immediately, it just won't have synced yet.
 */
export async function syncThemeToServer(theme: Theme) {
  try {
    await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme }),
    });
  } catch {
    // best-effort — local theme already applied regardless
  }
}

/**
 * Inline script injected into <head> so the correct theme is applied
 * before first paint (no flash of the wrong theme on load).
 */
export const THEME_BOOT_SCRIPT = `
(function() {
  try {
    var theme = localStorage.getItem("${STORAGE_KEY}");
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  } catch (e) {}
})();
`;

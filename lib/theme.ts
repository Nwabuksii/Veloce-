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

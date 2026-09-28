import { getStoredUser, saveUser } from "@/lib/client-session";
import { applyTheme, syncThemeToServer, Theme } from "@/lib/theme";

// Flip light/dark, persist it to the server, and keep the cached user in
// sync so the next page load in this browser picks it up immediately.
export function toggleTheme() {
  const next: Theme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  syncThemeToServer(next);
  const user = getStoredUser();
  if (user) saveUser({ ...user, theme: next });
}

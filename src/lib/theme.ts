/**
 * Light/dark theme for the desk.
 *
 * The palette lives in CSS variables (`src/styles.css`), so switching is one
 * class on `<html>`. The choice is stored in localStorage; `THEME_BOOT_SCRIPT`
 * runs in `<head>` before paint so a dark-mode teacher never sees a white flash.
 */
export type Theme = "light" | "dark";

export const THEME_KEY = "ian-theme";

/** Inlined in `<head>`; must stay dependency-free and synchronous. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

export function readTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage blocked — the theme still applies for this visit */
  }
}

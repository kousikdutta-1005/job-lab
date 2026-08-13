/**
 * Light/dark switching for the shadcn preset.
 *
 * The preset ships both scales, so the app now honours the one you asked for
 * and follows the OS when you have not asked for either. Stored in
 * localStorage like every other preference here — nothing leaves the browser.
 */
export type Theme = "dark" | "light" | "system"

const KEY = "joblab.theme"

export function readTheme(): Theme {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === "dark" || raw === "light" || raw === "system") return raw
  } catch {
    /* private browsing */
  }
  return "dark"
}

/** The scale actually painted, once "system" has been resolved. */
export function resolveTheme(theme: Theme): "dark" | "light" {
  if (theme !== "system") return theme
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
  } catch {
    return "dark"
  }
}

export function applyTheme(theme: Theme): void {
  const resolved = resolveTheme(theme)
  document.documentElement.setAttribute("data-theme", resolved)
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* private browsing */
  }
}

/**
 * Repaint when the OS flips, but only while following it. Returns an
 * unsubscribe so callers can clean up.
 */
export function watchSystem(theme: Theme, onChange: () => void): () => void {
  if (theme !== "system") return () => {}
  try {
    const mq = window.matchMedia("(prefers-color-scheme: light)")
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  } catch {
    return () => {}
  }
}

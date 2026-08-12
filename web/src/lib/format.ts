import type { Band } from "./types"

export function inr(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—"
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)} Cr`
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(1)} L`
  return `₹${Math.round(value).toLocaleString("en-IN")}`
}

export function money(value: number, currency: string): string {
  if (!Number.isFinite(value) || value <= 0) return "—"
  if (currency === "INR") return inr(value)
  const symbol = { USD: "$", EUR: "€", GBP: "£", CAD: "C$", AUD: "A$", SGD: "S$" }[currency] ?? ""
  if (value >= 1000) return `${symbol || currency + " "}${Math.round(value / 1000)}k`
  return `${symbol || currency + " "}${Math.round(value)}`
}

export function bandText(band: Band): string {
  return `${inr(band.p25)} – ${inr(band.p75)}`
}

export function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return null
  return Math.floor((Date.now() - then) / 86_400_000)
}

export function ago(iso: string | null | undefined): string {
  const days = daysAgo(iso)
  if (days === null) return "date unknown"
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export function scoreClass(score: number): string {
  if (score >= 80) return "s-hot"
  if (score >= 65) return "s-good"
  if (score >= 45) return "s-mid"
  return "s-low"
}

export function logoFor(domain: string | null | undefined): string | null {
  if (!domain) return null
  // Google's favicon service needs no key and never rate-limits a personal
  // tool. Clearbit's logo API is prettier but has started refusing anonymous
  // traffic, and a broken image is worse than a plain one.
  return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
}

export function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

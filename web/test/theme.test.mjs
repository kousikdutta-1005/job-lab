/**
 * The shadcn preset ships two scales. This checks both actually paint, that
 * the choice survives a reload, and — the part that matters — that text stays
 * readable in each. A theme toggle that silently drops contrast is worse than
 * not having one.
 */
import { chromium } from "playwright-core"

const URL = process.env.URL ?? "http://127.0.0.1:5180/"
let failures = 0

function check(name, ok, detail = "") {
  console.log(`  ${ok ? "." : "✗"} ${name}${ok ? "" : "  — " + detail}`)
  if (!ok) failures++
}

/** sRGB relative luminance, per WCAG. */
function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))

await page.goto(URL, { waitUntil: "networkidle" })
await page.fill("#u", "kousik")
await page.fill("#p", "kousik@1209")
await page.click('button[type="submit"]')
await page.waitForSelector(".shell", { timeout: 15000 })

/** Reads the colours that actually reached the screen, as rgb triples. */
async function sample(theme) {
  await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme)
  await page.waitForTimeout(250)
  return page.evaluate(() => {
    // Chrome reports oklch() verbatim, so parsing the computed string yields
    // lightness/chroma/hue, not sRGB. Painting the colour and reading the
    // pixel back is the only way to get what the eye actually receives.
    const cv = document.createElement("canvas")
    cv.width = cv.height = 1
    const ctx = cv.getContext("2d", { willReadFrequently: true })
    const rgb = (v) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = "#000"
      ctx.fillStyle = v
      ctx.fillRect(0, 0, 1, 1)
      return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3)
    }
    const cs = getComputedStyle(document.documentElement)
    const tok = (n) => rgb(cs.getPropertyValue(n).trim())
    return {
      bg: tok("--bg"),
      panel: tok("--bg-panel"),
      ink: tok("--ink"),
      ink2: tok("--ink-2"),
      ink3: tok("--ink-3"),
      accent: tok("--accent"),
      accentInk: tok("--accent-ink"),
      accentText: tok("--accent-text"),
      good: tok("--good"),
      warn: tok("--warn"),
      bad: tok("--bad"),
      body: rgb(getComputedStyle(document.body).backgroundColor),
      font: getComputedStyle(document.body).fontFamily,
      heading: getComputedStyle(document.querySelector("h1, h2, .pane-title") ?? document.body).fontFamily,
    }
  })
}

for (const theme of ["dark", "light"]) {
  console.log(`\n[${theme}]`)
  const s = await sample(theme)

  // Body text must clear WCAG AA for normal text.
  check(`${theme}: body text on background`, contrast(s.ink, s.bg) >= 4.5, contrast(s.ink, s.bg).toFixed(2))
  // Secondary text is used for whole sentences, so it gets the same bar.
  check(`${theme}: secondary text on panel`, contrast(s.ink2, s.panel) >= 4.5, contrast(s.ink2, s.panel).toFixed(2))
  // Muted labels are short, so AA-large (3:1) is the honest bar.
  check(`${theme}: muted text on panel`, contrast(s.ink3, s.panel) >= 3, contrast(s.ink3, s.panel).toFixed(2))

  // The preset's primary is a fill colour; its own foreground must sit on it.
  check(`${theme}: primary button label on fill`, contrast(s.accentInk, s.accent) >= 4.5, contrast(s.accentInk, s.accent).toFixed(2))
  // ...and the text-weight variant must be readable on the page, which the
  // raw preset primary is not in dark mode.
  check(`${theme}: accent text on background`, contrast(s.accentText, s.bg) >= 4.5, contrast(s.accentText, s.bg).toFixed(2))

  for (const tone of ["good", "warn", "bad"]) {
    check(`${theme}: ${tone} tone on panel`, contrast(s[tone], s.panel) >= 3, contrast(s[tone], s.panel).toFixed(2))
  }

  check(`${theme}: body uses the preset sans`, /DM Sans/.test(s.font), s.font)
  check(`${theme}: headings use the preset sans`, /Geist/.test(s.heading), s.heading)

  const dark = luminance(s.body) < 0.2
  check(`${theme}: background matches the scale`, theme === "dark" ? dark : !dark, `luminance ${luminance(s.body).toFixed(3)}`)
}

// The preference has to survive a reload, which is the whole point of storing it.
console.log("\n[persistence]")
await page.evaluate(() => localStorage.setItem("joblab.theme", "light"))
await page.reload({ waitUntil: "networkidle" })
await page.waitForTimeout(400)
check("light survives a reload", (await page.getAttribute("html", "data-theme")) === "light")

// And it must be right on the very first paint, not corrected afterwards.
const painted = await page.evaluate(() => document.documentElement.getAttribute("data-theme"))
check("no flash of the wrong scale", painted === "light", String(painted))

await page.evaluate(() => localStorage.setItem("joblab.theme", "dark"))
await page.reload({ waitUntil: "networkidle" })
await page.waitForTimeout(400)
check("dark survives a reload", (await page.getAttribute("html", "data-theme")) === "dark")

check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "))

await browser.close()
console.log(failures === 0 ? "\nPASS — both scales are readable" : `\nFAIL — ${failures}`)
process.exit(failures === 0 ? 0 : 1)

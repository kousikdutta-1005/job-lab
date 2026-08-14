import { chromium } from "playwright-core"

const URL = process.env.URL ?? "http://127.0.0.1:5180/"
const PASSWORD = process.env.JOBLAB_PASSWORD ?? "kousik@1209"
let failures = 0

function check(name, ok, detail = "") {
  console.log(`  ${ok ? "." : "x"} ${name}${ok ? "" : ` -- ${detail}`}`)
  if (!ok) failures++
}

async function login(page) {
  await page.goto(URL, { waitUntil: "networkidle" })
  await page.fill("#u", "kousik")
  await page.fill("#p", PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForSelector(".shell", { timeout: 15000 })
}

async function unnamedControls(page) {
  return page.locator("button, a[href], input:not([type=hidden]), select, textarea").evaluateAll((elements) =>
    elements
      .filter((element) => {
        const style = getComputedStyle(element)
        return style.display !== "none" && style.visibility !== "hidden"
      })
      .filter((element) => {
        const labels = "labels" in element ? element.labels : null
        const name =
          element.getAttribute("aria-label") ||
          element.getAttribute("aria-labelledby") ||
          element.getAttribute("title") ||
          element.textContent?.trim() ||
          (labels && labels.length ? Array.from(labels).map((label) => label.textContent).join(" ") : "")
        return !name
      })
      .map((element) => element.outerHTML.slice(0, 180)),
  )
}

async function documentOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
}

const browser = await chromium.launch({ channel: "chrome", headless: true })

console.log("\n[desktop semantics and keyboard]")
const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await login(desktop)
await desktop.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined))
await desktop.keyboard.press("Tab")
check("skip link is the first keyboard target", await desktop.locator(".skip-link").evaluate((el) => el === document.activeElement))
await desktop.keyboard.press("Enter")
check("skip link moves focus to main", await desktop.locator("#main-content").evaluate((el) => el === document.activeElement))

check("header landmark exists", (await desktop.locator("header").count()) === 1)
check("main landmark exists", (await desktop.locator("main").count()) === 1)
check("desktop navigation is named", (await desktop.locator('nav[aria-label="Primary"]').count()) === 1)
check("current view has one h1", (await desktop.locator("main h1").count()) === 1)

for (const label of ["Today", "Board", "Advisor", "Applications", "Contacts", "Portfolio", "Pay", "Negotiate", "Settings"]) {
  await desktop.locator(`.nav button:has-text("${label}")`).click()
  await desktop.waitForTimeout(50)
  const unnamed = await unnamedControls(desktop)
  check(`${label}: visible controls have names`, unnamed.length === 0, unnamed[0] ?? "")
  check(`${label}: page has an h1`, (await desktop.locator("main h1").count()) >= 1)
}

await desktop.locator('.nav button:has-text("Board")').focus()
await desktop.keyboard.press("Enter")
await desktop.waitForSelector(".job")
await desktop.locator(".job").first().focus()
await desktop.keyboard.press("Enter")
await desktop.waitForSelector(".detail")
check("job detail opens from the keyboard", await desktop.locator(".detail").isVisible())
check("job tabs expose tablist semantics", (await desktop.locator('.detail [role="tablist"]').count()) === 1)
check("job tabs expose one selected tab", (await desktop.locator('.detail [role="tab"][aria-selected="true"]').count()) === 1)
check("job detail exposes a named tab panel", (await desktop.locator('.detail [role="tabpanel"][aria-labelledby]').count()) === 1)
const selectedTab = desktop.locator('.detail [role="tab"][aria-selected="true"]')
await selectedTab.focus()
await desktop.keyboard.press("ArrowRight")
await desktop.waitForFunction(() => {
  const active = document.activeElement
  return active?.getAttribute("role") === "tab" && active.getAttribute("aria-selected") === "true"
})
check(
  "job tabs support arrow-key navigation",
  await desktop.locator('.detail [role="tab"][aria-selected="true"]').evaluate((el) => el === document.activeElement),
)
const horizontalTabId = await desktop.locator('.detail [role="tab"][aria-selected="true"]').getAttribute("id")
await desktop.keyboard.press("ArrowDown")
check(
  "horizontal job tabs leave vertical arrow keys available",
  (await desktop.locator('.detail [role="tab"][aria-selected="true"]').getAttribute("id")) === horizontalTabId,
)
await desktop.keyboard.press("Escape")
await desktop.waitForSelector(".detail", { state: "hidden" })
check("Escape restores focus to the invoking job", await desktop.locator(".job").first().evaluate((el) => el === document.activeElement))

const reduced = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } })
const reducedPage = await reduced.newPage()
await login(reducedPage)
const transitionSeconds = await reducedPage.locator(".command-card").first().evaluate((element) =>
  getComputedStyle(element)
    .transitionDuration.split(",")
    .map((value) => parseFloat(value) || 0)
    .reduce((max, value) => Math.max(max, value), 0),
)
check("reduced motion removes meaningful transitions", transitionSeconds < 0.001, String(transitionSeconds))
await reduced.close()

console.log("\n[mobile focus, dialog, and reflow]")
const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
})
const mobile = await mobileContext.newPage()
await login(mobile)
await mobile.locator('.mobile-nav button:has-text("Board")').click()
await mobile.locator(".job").first().click()
await mobile.waitForSelector(".detail")
check("mobile detail moves focus to its heading", await mobile.locator(".detail h1").evaluate((el) => el === document.activeElement))
check(
  "mobile detail isolates the covered role list",
  await mobile.locator(".rail").evaluate((rail) => rail.inert && rail.getAttribute("aria-hidden") === "true"),
)
await mobile.locator('.mobile-nav button:has-text("More")').click()
await mobile.keyboard.press("Escape")
check("closing More leaves the underlying detail open", await mobile.locator(".detail").isVisible())
await mobile.waitForFunction(() => document.activeElement?.textContent?.includes("More"))
await mobile.locator(".detail-back").focus()
await mobile.keyboard.press("Enter")
check("mobile detail restores focus to the invoking job", await mobile.locator(".job").first().evaluate((el) => el === document.activeElement))

const moreButton = mobile.locator('.mobile-nav button:has-text("More")')
await moreButton.click()
check("mobile More opens a modal dialog", (await mobile.locator('[role="dialog"][aria-modal="true"]').count()) === 1)
check("dialog moves focus to Close", await mobile.locator(".mobile-sheet-close").evaluate((el) => el === document.activeElement))
check(
  "dialog makes the background inert",
  await mobile.locator("#main-content").evaluate((main) => main.inert) &&
    await mobile.locator(".mobile-nav").evaluate((nav) => nav.inert),
)
await mobile.keyboard.press("Shift+Tab")
check("dialog wraps reverse tab focus", await mobile.locator(".mobile-more").evaluate((panel) => panel.contains(document.activeElement)))
await mobile.keyboard.press("Escape")
check("dialog restores focus to More", await moreButton.evaluate((el) => el === document.activeElement))
await moreButton.click()
await mobile.setViewportSize({ width: 900, height: 844 })
await mobile.waitForSelector('[role="dialog"]', { state: "hidden" })
check(
  "crossing the mobile breakpoint closes More and restores the page",
  await mobile.locator("#main-content").evaluate((main) => !main.inert),
)
await mobile.setViewportSize({ width: 390, height: 844 })
check("mobile visible controls have names", (await unnamedControls(mobile)).length === 0)
check("390px document reflows without 2D scrolling", await documentOverflow(mobile))

await mobile.setViewportSize({ width: 320, height: 720 })
check("320px document reflows without 2D scrolling", await documentOverflow(mobile))

const zoomContext = await browser.newContext({ viewport: { width: 720, height: 900 } })
const zoomPage = await zoomContext.newPage()
await login(zoomPage)
check("200% equivalent viewport uses mobile navigation", await zoomPage.locator(".mobile-nav").isVisible())
check("200% equivalent viewport has no document overflow", await documentOverflow(zoomPage))
await zoomContext.close()

await mobileContext.close()
await desktop.close()
await browser.close()

console.log(failures === 0 ? "\nPASS -- accessibility structure and keyboard flows" : `\nFAIL -- ${failures} accessibility checks`)
process.exit(failures === 0 ? 0 : 1)

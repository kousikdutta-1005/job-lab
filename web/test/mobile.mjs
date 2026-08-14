import { chromium } from "playwright-core"
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const URL = process.env.URL ?? "http://127.0.0.1:5180/"
const PASSWORD = process.env.JOBLAB_PASSWORD ?? "kousik@1209"
const here = dirname(fileURLToPath(import.meta.url))
const screenshots = join(here, "..", "..", "screenshots")
mkdirSync(screenshots, { recursive: true })

let failures = 0
function check(name, ok, detail = "") {
  console.log(`  ${ok ? "." : "x"} ${name}${ok ? "" : ` -- ${detail}`}`)
  if (!ok) failures++
}

async function noDocumentOverflow(page, label) {
  const size = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  check(`${label}: no document overflow`, size.scroll <= size.client, `${size.scroll}px / ${size.client}px`)
}

async function unlock(page) {
  await page.goto(URL, { waitUntil: "networkidle" })
  await page.click('button[type="submit"]')
  await page.waitForSelector(".error")
  check("login: empty form explains recovery", await page.locator(".error").isVisible())
  await page.fill("#u", "kousik")
  await page.fill("#p", PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForSelector(".shell", { timeout: 15000 })
}

async function openPrimary(page, label) {
  await page.locator(`.mobile-nav button:has-text("${label}")`).click()
  if (label === "Board") {
    await page.waitForSelector(".rail")
  } else {
    await page.waitForSelector(`.title:has-text("${label}")`)
  }
}

async function openMore(page, label) {
  await page.locator('.mobile-nav button:has-text("More")').click()
  await page.waitForSelector(".mobile-more")
  check(`navigation: ${label} is discoverable`, await page.locator(`.mobile-more-grid button:has-text("${label}")`).isVisible())
  await page.locator(`.mobile-more-grid button:has-text("${label}")`).click()
  await page.waitForSelector(`.title:has-text("${label}")`)
}

const browser = await chromium.launch({ channel: "chrome", headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const page = await context.newPage()
const errors = []
page.on("pageerror", (error) => errors.push(error.message))

console.log("\n[authenticated product at 390x844]")
await unlock(page)
check("navigation: thumb bar is visible", await page.locator(".mobile-nav").isVisible())
check("today: highest-leverage tasks visible", await page.locator(".command-center").isVisible())
await noDocumentOverflow(page, "today")

await page.evaluate(() => {
  localStorage.setItem("joblab.theme", "light")
  document.documentElement.setAttribute("data-theme", "light")
})
await page.waitForTimeout(250)
await page.screenshot({ path: join(screenshots, "joblab-mobile-light-today.png"), fullPage: false })

await openPrimary(page, "Board")
check("board: role list visible", (await page.locator(".job").count()) > 0)
check("board: filters are explicit", await page.locator(".filter-toggle").isVisible())
await page.locator(".filter-toggle").click()
check("board: sort remains reachable", await page.locator("#board-sort").isVisible())
await page.locator(".filter-toggle").click()
const dismissMetrics = await page.locator(".job-dismiss").first().evaluate((element) => {
  const rect = element.getBoundingClientRect()
  return { opacity: Number(getComputedStyle(element).opacity), width: rect.width, height: rect.height }
})
check(
  "board: touch dismiss control remains visible and usable",
  dismissMetrics.opacity > 0 && dismissMetrics.width >= 40 && dismissMetrics.height >= 44,
  JSON.stringify(dismissMetrics),
)
await noDocumentOverflow(page, "board")

await page.locator(".search").fill("no-role-can-match-this-query-2049")
await page.waitForSelector('[data-state="no-results"]')
check("board: zero results has recovery", await page.getByRole("button", { name: "Clear search and filters" }).isVisible())
await page.screenshot({ path: join(screenshots, "joblab-mobile-light-empty-search.png"), fullPage: false })
await page.getByRole("button", { name: "Clear search and filters" }).click()
await page.waitForSelector(".job")

await page.evaluate(() => {
  localStorage.setItem("joblab.theme", "dark")
  document.documentElement.setAttribute("data-theme", "dark")
})
await page.waitForTimeout(250)
await page.locator(".job").first().click()
await page.waitForSelector(".detail")
check("detail: explicit list return is visible", await page.locator(".detail-back").isVisible())
check("detail: primary application action is visible", await page.getByRole("button", { name: /Open & track application/ }).isVisible())
await noDocumentOverflow(page, "job detail")
await page.screenshot({ path: join(screenshots, "joblab-mobile-dark-detail.png"), fullPage: false })

for (const tab of ["Apply packet", "The role", "Resume", "Who to contact", "Write to them", "Prepare"]) {
  const button = page.locator(`.detail .tabs button:has-text("${tab}")`).first()
  await button.scrollIntoViewIfNeeded()
  await button.click()
  check(`detail tab: ${tab}`, await button.evaluate((element) => element.classList.contains("on")))
  await noDocumentOverflow(page, `detail ${tab}`)
}
await page.locator(".detail-back").click()
check("detail: returns to same list", await page.locator(".job").first().isVisible())

await openPrimary(page, "Applications")
check("applications: empty state is useful", await page.locator('[data-state="empty-applications"]').isVisible())
check("applications: manual recovery action visible", await page.getByRole("button", { name: "Add an application by hand" }).isVisible())
await noDocumentOverflow(page, "applications")

await openPrimary(page, "Contacts")
check("contacts: empty state is useful", await page.locator('[data-state="empty-contacts"]').isVisible())
await page.getByRole("button", { name: "Save contact" }).click()
check("contacts: invalid form explains requirement", await page.locator(".form-error").isVisible())
await noDocumentOverflow(page, "contacts")

for (const label of ["Advisor", "Portfolio", "Pay", "Negotiate", "Settings"]) {
  await openMore(page, label)
  check(`${label.toLowerCase()}: title visible`, await page.locator(".title").isVisible())
  await noDocumentOverflow(page, label.toLowerCase())
}

await page.locator('.mobile-nav button:has-text("More")').click()
check("more: theme control visible", await page.locator(".mobile-more-actions button:has-text('Theme')").isVisible())
check("more: lock control visible", await page.locator(".mobile-more-actions button:has-text('Lock')").isVisible())
await page.screenshot({ path: join(screenshots, "joblab-mobile-dark-more.png"), fullPage: false })
await page.locator(".mobile-sheet-close").click()

console.log("\n[narrow viewport at 320x720]")
await page.setViewportSize({ width: 320, height: 720 })
await openPrimary(page, "Board")
check("narrow: role list remains visible", await page.locator(".job").first().isVisible())
await noDocumentOverflow(page, "board 320px")
await page.locator(".job").first().click()
check("narrow: back remains visible", await page.locator(".detail-back").isVisible())
await noDocumentOverflow(page, "detail 320px")

console.log("\n[recoverable core-data failure]")
const failureContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
let failJobsOnce = true
await failureContext.route("**/data/jobs.json", async (route) => {
  if (failJobsOnce) {
    failJobsOnce = false
    await route.fulfill({ status: 503, contentType: "application/json", body: "{}" })
  } else {
    await route.continue()
  }
})
const failurePage = await failureContext.newPage()
const failureErrors = []
failurePage.on("pageerror", (error) => failureErrors.push(error.message))
await failurePage.goto(URL, { waitUntil: "networkidle" })
await failurePage.fill("#u", "kousik")
await failurePage.fill("#p", PASSWORD)
await failurePage.click('button[type="submit"]')
await failurePage.waitForSelector('[data-state="load-error"]', { timeout: 15000 })
check("data failure: honest error state visible", await failurePage.getByRole("heading", { name: "Board unavailable" }).isVisible())
check("data failure: retry action visible", await failurePage.getByRole("button", { name: "Try loading again" }).isVisible())
await noDocumentOverflow(failurePage, "data failure")
await failurePage.screenshot({ path: join(screenshots, "joblab-mobile-dark-data-error.png"), fullPage: false })
await failurePage.getByRole("button", { name: "Try loading again" }).click()
await failurePage.waitForSelector(".shell", { timeout: 15000 })
check("data failure: retry recovers the product", await failurePage.locator(".shell").isVisible())
check("data failure: no page errors", failureErrors.length === 0, failureErrors.slice(0, 2).join(" | "))

console.log("\n[malformed core-data failure]")
const malformedContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
})
let malformedJobsOnce = true
await malformedContext.route("**/data/jobs.json", async (route) => {
  if (malformedJobsOnce) {
    malformedJobsOnce = false
    const response = await route.fetch()
    const body = await response.json()
    body.jobs[0].cities = [{}]
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    })
  } else {
    await route.continue()
  }
})
const malformedPage = await malformedContext.newPage()
await malformedPage.goto(URL, { waitUntil: "networkidle" })
await malformedPage.fill("#u", "kousik")
await malformedPage.fill("#p", PASSWORD)
await malformedPage.click('button[type="submit"]')
await malformedPage.waitForSelector('[data-state="load-error"]', { timeout: 15000 })
check(
  "nested malformed data: names the invalid file",
  ((await malformedPage.locator(".state-card code").textContent()) ?? "").includes("jobs.json is malformed"),
)
await malformedPage.getByRole("button", { name: "Try loading again" }).click()
await malformedPage.waitForSelector(".shell", { timeout: 15000 })
check("malformed data: retry recovers the product", await malformedPage.locator(".shell").isVisible())

console.log("\n[malformed optional evidence]")
const optionalContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
})
await optionalContext.route("**/data/insights.json", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      generated_at: "2026-01-01T00:00:00Z",
      insights: [{ headline: "Broken evidence", body: "Recovery test", evidence: [null] }],
    }),
  }),
)
const optionalPage = await optionalContext.newPage()
const optionalErrors = []
optionalPage.on("pageerror", (error) => optionalErrors.push(error.message))
await optionalPage.goto(URL, { waitUntil: "networkidle" })
await optionalPage.fill("#u", "kousik")
await optionalPage.fill("#p", PASSWORD)
await optionalPage.click('button[type="submit"]')
await optionalPage.waitForSelector(".shell", { timeout: 15000 })
check(
  "optional malformed data: product remains available with honest notice",
  ((await optionalPage.locator(".global-notice").first().textContent()) ?? "").includes("optional evidence"),
)
await openMore(optionalPage, "Advisor")
check("optional malformed data: affected view remains usable", await optionalPage.getByRole("heading", { name: "Advisor" }).isVisible())
check("optional malformed data: no page errors", optionalErrors.length === 0, optionalErrors.slice(0, 2).join(" | "))

check("full product: no page errors", errors.length === 0, errors.slice(0, 2).join(" | "))

await optionalContext.close()
await malformedContext.close()
await failureContext.close()
await context.close()
await browser.close()

console.log(failures === 0 ? "\nPASS -- mobile product and recovery flows" : `\nFAIL -- ${failures} mobile checks`)
process.exit(failures === 0 ? 0 : 1)

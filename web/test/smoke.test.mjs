/**
 * Does the app actually render, or does it merely return HTTP 200?
 *
 * A dev server answering 200 says nothing about whether React mounted. This
 * drives a real browser, logs in, visits every view, and fails on any console
 * error — which is the only way to catch the class of bug that leaves a blank
 * page behind a perfectly healthy status code.
 *
 *   node test/smoke.test.mjs [url]
 */

import { chromium } from "playwright-core"
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const shots = join(here, "..", "..", "screenshots")
const base = process.argv[2] ?? "http://127.0.0.1:5180"

const USER = "kousik"
const PASSWORD = process.env.JOBLAB_PASSWORD ?? "kousik@1209"

const VIEWS = ["Today", "Board", "Advisor", "Applications", "Contacts", "Pay", "Negotiate", "Settings"]

mkdirSync(shots, { recursive: true })

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const errors = []
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text())
})
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`))

let failures = 0
const fail = (message) => {
  console.log(`  x ${message}`)
  failures += 1
}

await page.goto(base, { waitUntil: "networkidle" })

// --- login ---------------------------------------------------------------
const heading = await page.textContent("h1").catch(() => null)
console.log(`login screen heading: ${JSON.stringify(heading)}`)
if (!heading) fail("no heading rendered — React did not mount")

await page.fill("#u", USER)
await page.fill("#p", PASSWORD)
await page.screenshot({ path: join(shots, "01-login.png") })
await page.click('button[type="submit"]')

await page.waitForSelector(".shell", { timeout: 15000 }).catch(() => fail("did not reach the app after login"))

// The app now opens on Today; the board is one click away.
await page.waitForSelector(".card, .empty", { timeout: 15000 }).catch(() => fail("today never populated"))
await page.locator('.nav button:has-text("Board")').first().click()
await page.waitForSelector(".job, .empty", { timeout: 15000 }).catch(() => fail("board never populated"))

const jobCount = await page.locator(".job").count()
console.log(`board rendered with ${jobCount} job cards`)
if (jobCount === 0) fail("no job cards on the board")

const mapPaths = await page.locator(".country").count()
console.log(`map rendered with ${mapPaths} country paths`)
if (mapPaths < 100) fail(`expected the world, got ${mapPaths} country paths`)

await page.screenshot({ path: join(shots, "02-board.png") })

// --- a job detail --------------------------------------------------------
if (jobCount > 0) {
  await page.locator(".job").first().click()
  await page.waitForSelector(".detail", { timeout: 8000 }).catch(() => fail("job detail never opened"))
  const title = await page.textContent(".detail h1").catch(() => null)
  console.log(`opened detail: ${JSON.stringify(title?.slice(0, 60))}`)
  await page.screenshot({ path: join(shots, "03-job-detail.png") })

  for (const tab of ["Resume", "Who to contact", "Write to them", "Prepare"]) {
    const button = page.locator(`.tabs button:has-text("${tab}")`).first()
    if ((await button.count()) === 0) {
      fail(`tab "${tab}" missing`)
      continue
    }
    await button.click()
    await page.waitForTimeout(300)
  }
  await page.screenshot({ path: join(shots, "04-job-write.png") })
}

// --- every top-level view ------------------------------------------------
for (const view of VIEWS) {
  const button = page.locator(`.nav button:has-text("${view}")`).first()
  if ((await button.count()) === 0) {
    fail(`nav item "${view}" missing`)
    continue
  }
  await button.click()
  await page.waitForTimeout(600)
  const body = (await page.textContent(".main")) ?? ""
  if (body.trim().length < 40) fail(`view "${view}" rendered almost nothing`)
  console.log(`view ${view.padEnd(13)} ${body.trim().length} chars`)
  await page.screenshot({
    path: join(shots, `05-${view.toLowerCase().replace(/\s+/g, "-")}.png`),
    fullPage: view !== "Board",
  })
}

// --- console must be clean ----------------------------------------------
const noisy = errors.filter(
  (e) =>
    !e.includes("favicon") &&
    !e.includes("google.com/s2") &&
    !e.includes("ERR_INTERNET_DISCONNECTED"),
)
if (noisy.length) {
  console.log("\nconsole errors:")
  for (const error of noisy.slice(0, 10)) console.log(`  ! ${error.slice(0, 180)}`)
  failures += noisy.length
}

await browser.close()

console.log(failures === 0 ? "\nPASS - app renders and every view works" : `\nFAIL - ${failures} problem(s)`)
process.exit(failures === 0 ? 0 : 1)

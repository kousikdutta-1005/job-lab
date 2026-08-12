/**
 * Capture the board for the portfolio's Experiments page.
 *
 *   node test/capture.mjs [url] [outdir]
 */

import { chromium } from "playwright-core"
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const base = process.argv[2] ?? "http://127.0.0.1:5180"
const out = process.argv[3] ?? join(here, "..", "..", "screenshots")
const PASSWORD = process.env.JOBLAB_PASSWORD ?? "kousik@1209"

mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 2,
})

await page.goto(base, { waitUntil: "networkidle" })
await page.fill("#u", "kousik")
await page.fill("#p", PASSWORD)
await page.click('button[type="submit"]')
await page.waitForSelector(".job", { timeout: 20000 })

// Let the map settle and the favicons resolve before the shutter.
await page.waitForTimeout(2500)
await page.screenshot({ path: join(out, "joblab-board.png") })
console.log("captured board")

await page.locator(".job").first().click()
await page.waitForSelector(".detail", { timeout: 8000 })
await page.locator('.tabs button:has-text("Who to contact")').first().click()
await page.waitForTimeout(700)
await page.screenshot({ path: join(out, "joblab-contacts.png") })
console.log("captured contacts")

await browser.close()

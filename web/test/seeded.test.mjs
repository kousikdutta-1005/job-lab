/**
 * The views that only exist once you have used the tool for a month.
 *
 * Applications and Contacts render an empty state until there is data in them,
 * so the smoke test — which starts from a clean browser — has never once seen
 * the code that draws a pipeline, a follow-up warning, or a contact card. This
 * seeds a plausible six weeks of job hunting into localStorage first, then
 * drives the same browser through it.
 *
 *   node test/seeded.test.mjs [url]
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

mkdirSync(shots, { recursive: true })

const day = (offset) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10)

const CONTACTS = [
  {
    id: "c-anita",
    name: "Anita Raghavan",
    title: "Director of Design",
    company: "Razorpay",
    email: "anita.raghavan@razorpay.com",
    linkedin_url: "https://www.linkedin.com/in/example-anita/",
    relationship: "hiring_manager",
    notes: "Spoke at Design Up 2024. Opened with her talk on payments onboarding.",
    added: day(30),
    last_contacted: day(9),
  },
  {
    id: "c-vikram",
    name: "Vikram Shetty",
    title: "Senior Product Designer",
    company: "Zerodha",
    linkedin_url: "https://www.linkedin.com/in/example-vikram/",
    relationship: "referral",
    notes: "Ex-colleague from Swiggy. Said he would forward my portfolio internally.",
    added: day(21),
  },
  {
    id: "c-priya",
    name: "Priya Nair",
    title: "Technical Recruiter",
    company: "Atlassian",
    email: "pnair@atlassian.com",
    relationship: "recruiter",
    notes: "Reached out on LinkedIn about the Bengaluru design opening.",
    added: day(14),
    last_contacted: day(2),
  },
  {
    id: "c-daniel",
    name: "Daniel Osei",
    title: "Head of Design",
    company: "Linear",
    relationship: "employee",
    linkedin_url: "https://www.linkedin.com/in/example-daniel/",
    notes: "No email found. Only route is a cold DM or the Linear community Slack.",
    added: day(5),
  },
]

const APPLICATIONS = [
  {
    id: "a-1",
    job_id: null,
    title: "Senior Product Designer",
    company: "Razorpay",
    company_domain: "razorpay.com",
    url: "https://boards.greenhouse.io/razorpay/jobs/000001",
    location: "Bengaluru, India",
    work_mode: "hybrid",
    stage: "interview",
    date_saved: day(34),
    date_applied: day(31),
    salary_min: 4200000,
    salary_max: 5600000,
    currency: "INR",
    excitement: 5,
    notes: "Second round is a portfolio walkthrough with the payments team.",
    resume_version: "resume-payments-v3.pdf",
    contact_ids: ["c-anita"],
    activities: [
      { id: "x1", type: "interview", date: day(4), title: "Round 1 with hiring manager — went well" },
      { id: "x2", type: "email_sent", date: day(9), title: "Thank-you note to Anita" },
      { id: "x3", type: "applied", date: day(31), title: "Applied via Greenhouse" },
    ],
  },
  {
    id: "a-2",
    job_id: null,
    title: "Product Designer, Growth",
    company: "Atlassian",
    company_domain: "atlassian.com",
    url: "https://www.atlassian.com/company/careers/detail/000002",
    location: "Bengaluru, India",
    work_mode: "remote",
    stage: "phone_screen",
    date_saved: day(20),
    date_applied: day(18),
    excitement: 4,
    currency: "INR",
    notes: "Recruiter screen booked for next week.",
    contact_ids: ["c-priya"],
    activities: [
      { id: "x4", type: "note", date: day(2), title: "Priya confirmed the screen" },
      { id: "x5", type: "applied", date: day(18), title: "Applied via careers site" },
    ],
  },
  {
    id: "a-3",
    job_id: null,
    title: "Staff Product Designer",
    company: "Linear",
    company_domain: "linear.app",
    url: "https://jobs.ashbyhq.com/linear/000003",
    location: "Remote — Americas",
    work_mode: "remote",
    stage: "applied",
    date_saved: day(15),
    date_applied: day(13),
    excitement: 5,
    notes: "Region-locked to the Americas. Applied anyway, flagged the timezone overlap.",
    contact_ids: ["c-daniel"],
    activities: [{ id: "x6", type: "applied", date: day(13), title: "Applied via Ashby" }],
  },
  {
    id: "a-4",
    job_id: null,
    title: "Senior UX Designer",
    company: "Zerodha",
    company_domain: "zerodha.com",
    url: "https://zerodha.com/careers/000004",
    location: "Bengaluru, India",
    work_mode: "onsite",
    stage: "offer",
    date_saved: day(45),
    date_applied: day(42),
    salary_min: 3800000,
    salary_max: 4200000,
    currency: "INR",
    excitement: 3,
    notes: "Offer at 38L. Below the published Bengaluru senior band — counter at 46L.",
    contact_ids: ["c-vikram"],
    activities: [
      { id: "x7", type: "offer", date: day(3), title: "Verbal offer, 38L fixed" },
      { id: "x8", type: "interview", date: day(12), title: "Final round with founders" },
      { id: "x9", type: "applied", date: day(42), title: "Referred by Vikram" },
    ],
  },
  {
    id: "a-5",
    job_id: null,
    title: "Product Designer",
    company: "Swiggy",
    url: "https://careers.swiggy.com/000005",
    location: "Bengaluru, India",
    work_mode: "hybrid",
    stage: "rejected",
    date_saved: day(60),
    date_applied: day(58),
    notes: "Rejected after the portfolio review. No feedback given.",
    contact_ids: [],
    activities: [
      { id: "x10", type: "rejected", date: day(40), title: "Rejection email" },
      { id: "x11", type: "applied", date: day(58), title: "Applied via careers site" },
    ],
  },
  {
    id: "a-6",
    job_id: null,
    title: "Design Lead, Design Systems",
    company: "Freshworks",
    url: "https://careers.freshworks.com/000006",
    location: "Chennai, India",
    work_mode: "hybrid",
    stage: "wishlist",
    date_saved: day(2),
    excitement: 4,
    notes: "Not applied yet — want to rework the systems case study first.",
    contact_ids: [],
    activities: [],
  },
  {
    id: "a-7",
    job_id: null,
    title: "Senior Designer, Platform",
    company: "Postman",
    url: "https://boards.greenhouse.io/postman/jobs/000007",
    location: "Bengaluru, India",
    work_mode: "hybrid",
    stage: "applied",
    // Applied 11 days ago with no chase logged: this is the row that must
    // trigger the follow-up warning.
    date_saved: day(13),
    date_applied: day(11),
    excitement: 4,
    notes: "",
    contact_ids: [],
    activities: [{ id: "x12", type: "applied", date: day(11), title: "Applied via Greenhouse" }],
  },
]

const SETTINGS = {
  full_name: "Kousik Dutta",
  email: "kousik@example.com",
  phone: "+91 90000 00000",
  portfolio: "https://kousikdutta-1005.github.io/portfolio/",
  linkedin: "https://www.linkedin.com/in/example-kousik/",
  location: "Bengaluru, India",
  years: 5,
  resume_name: "kousik-dutta-resume.pdf",
  resume_text:
    "Kousik Dutta — Product Designer, 5 years. Led design systems and onboarding for fintech " +
    "and commerce products. Figma, prototyping, user research, usability testing, design tokens, " +
    "accessibility, A/B testing, information architecture, wireframing, interaction design. " +
    "Shipped a component library used by 40 engineers. Ran 60+ moderated research sessions. " +
    "Improved checkout completion by 18% through iterative testing.",
}

const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const errors = []
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text())
})
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))

let failures = 0
const fail = (message) => {
  console.log(`  x ${message}`)
  failures += 1
}
const pass = (message) => console.log(`  . ${message}`)

// Seed before the app boots, so React reads it on first render.
await page.goto(base, { waitUntil: "domcontentloaded" })
await page.evaluate(
  ([apps, contacts, settings]) => {
    localStorage.setItem("joblab.applications", JSON.stringify(apps))
    localStorage.setItem("joblab.contacts", JSON.stringify(contacts))
    localStorage.setItem("joblab.settings", JSON.stringify(settings))
  },
  [APPLICATIONS, CONTACTS, SETTINGS],
)
await page.goto(base, { waitUntil: "networkidle" })

await page.fill("#u", USER)
await page.fill("#p", PASSWORD)
await page.click('button[type="submit"]')
await page.waitForSelector(".shell", { timeout: 15000 }).catch(() => fail("never reached the app"))

/* ----------------------------------------------------------- applications */

await page.locator('.nav button:has-text("Applications")').first().click()
await page.waitForTimeout(600)
const trackerText = await page.locator(".pane").innerText()

for (const company of ["Razorpay", "Atlassian", "Linear", "Zerodha", "Postman"]) {
  if (trackerText.includes(company)) pass(`tracker lists ${company}`)
  else fail(`tracker is missing ${company}`)
}
// Six applied, two of which reached interview or beyond.
if (/\b6\b/.test(trackerText)) pass("applied count reads 6")
else fail(`applied count wrong — got: ${trackerText.slice(0, 200)}`)

if (/follow|chase|waiting|nudge/i.test(trackerText)) pass("follow-up prompt surfaced")
else fail("Postman was applied to 11 days ago with no chase and nothing prompted a follow-up")

await page.screenshot({ path: join(shots, "10-applications.png"), fullPage: true })

// Open a row and check the activity log renders.
await page.locator(".pane").getByText("Razorpay", { exact: false }).first().click()
await page.waitForTimeout(500)
const detail = await page.locator(".pane").innerText()
if (detail.includes("Round 1") || detail.includes("Thank-you")) pass("activity log renders")
else fail("opened an application but no activity history rendered")
await page.screenshot({ path: join(shots, "11-application-detail.png"), fullPage: true })

/* --------------------------------------------------------------- contacts */

await page.locator('.nav button:has-text("Contacts")').first().click()
await page.waitForTimeout(600)
const contactsText = await page.locator(".pane").innerText()

for (const name of ["Anita Raghavan", "Vikram Shetty", "Priya Nair", "Daniel Osei"]) {
  if (contactsText.includes(name)) pass(`contacts list ${name}`)
  else fail(`contacts missing ${name}`)
}
if (/Director of Design/.test(contactsText)) pass("contact titles render")
else fail("contact titles missing")
await page.screenshot({ path: join(shots, "12-contacts.png"), fullPage: true })

/* ------------------------------------------------- today, now with a load */

await page.locator('.nav button:has-text("Today")').first().click()
await page.waitForTimeout(800)
const todayText = await page.locator(".pane").innerText()
console.log(`today: ${todayText.length} chars`)
if (todayText.length < 400) fail("Today is thin even with seven live applications")
else pass("Today has content")
if (/Postman|follow/i.test(todayText)) pass("Today knows about the stale Postman application")
else fail("Today did not raise the 11-day-old unanswered application")

// An open offer is the highest-stakes item in a job search. It must lead.
const cards = await page.locator(".pane .card").allInnerTexts()
const order = cards.slice(0, 4).map((c) => c.split("\n")[0])
console.log(`  order: ${order.join(" | ")}`)
if (/Zerodha/i.test(cards[0]) && /offer/i.test(cards[0])) pass("the live offer leads Today")
else fail(`an open offer did not lead Today — first card was: ${cards[0]?.slice(0, 120)}`)

const prepAt = cards.findIndex((c) => /Prepare for Razorpay/i.test(c))
const chaseAt = cards.findIndex((c) => /Follow up/i.test(c))
if (prepAt >= 0 && (chaseAt < 0 || prepAt < chaseAt)) pass("a booked interview outranks a chase")
else fail(`a follow-up outranked the interview (prep at ${prepAt}, chase at ${chaseAt})`)

if (/Prepare for Razorpay/i.test(todayText)) pass("Today raises the booked interview")
else fail("Razorpay is at interview stage and Today said nothing about preparing")

const resumeCards = (todayText.match(/never mentions/g) ?? []).length
if (resumeCards <= 1) pass(`resume gaps collapsed into ${resumeCards} card`)
else fail(`${resumeCards} near-identical resume cards — should be one`)
await page.screenshot({ path: join(shots, "13-today-loaded.png"), fullPage: true })

/* -------------------------------------------------------------- negotiate */

await page.locator('.nav button:has-text("Negotiate")').first().click()
await page.waitForTimeout(600)
const negotiateText = await page.locator(".pane").innerText()
console.log(`negotiate: ${negotiateText.length} chars`)
if (/Zerodha/i.test(negotiateText)) pass("Negotiate picked up the live offer")
else fail("there is an offer in the tracker and Negotiate did not mention it")
await page.screenshot({ path: join(shots, "14-negotiate-offer.png"), fullPage: true })

const realErrors = errors.filter((e) => !/favicon|404 \(Not Found\)/i.test(e))
if (realErrors.length) {
  console.log("console errors:")
  realErrors.forEach((e) => console.log(`    ${e}`))
  fail(`${realErrors.length} console errors`)
}

await browser.close()
console.log(failures ? `\nFAIL — ${failures} problem(s)` : "\nPASS — seeded views all render")
process.exit(failures ? 1 : 0)

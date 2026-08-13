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

if (/Where it is leaking/.test(trackerText)) pass("funnel renders")
else fail("no funnel on the applications view")
// Six applications is below the point where a rate means anything; it must say so.
if (/too few to read a pattern/i.test(trackerText)) pass("funnel refuses to read rates off 6 applications")
else fail("funnel drew conclusions from a sample of six")

await page.screenshot({ path: join(shots, "10-applications.png"), fullPage: true })

// Furthest along first: an offer at the bottom of the pipeline is a design bug.
const pipelineRoles = await page.locator("table.data tbody tr.row-click td:first-child").allInnerTexts()
console.log(`  pipeline: ${pipelineRoles.map((r) => r.split("\n")[1] ?? r).join(" | ")}`)
if (/Zerodha/.test(pipelineRoles[0] ?? "")) pass("the offer sorts to the top of the pipeline")
else fail(`pipeline is not sorted by stage — first row was ${pipelineRoles[0]?.slice(0, 60)}`)

// You apply to plenty of things the crawler never saw.
await page.locator('button:has-text("add by hand")').first().click()
await page.waitForTimeout(300)
await page.fill('input[placeholder="Senior Product Designer"]', "Principal Designer")
await page.fill('input[placeholder="Adobe"]', "Figma")
await page.locator('button:has-text("Track it")').click()
await page.waitForTimeout(400)
const afterAdd = await page.locator(".pane").innerText()
if (/Figma/.test(afterAdd)) pass("an off-board application can be tracked by hand")
else fail("adding an application by hand did not add a row")

await page.screenshot({ path: join(shots, "11-applications-add.png"), fullPage: true })

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

// Reaching out is the point of keeping contacts at all.
await page.locator("table.data tbody tr", { hasText: "Anita Raghavan" }).locator('button:has-text("write")').click()
await page.waitForTimeout(400)
const writer = await page.locator(".pane").innerText()
if (/Writing to Anita/.test(writer)) pass("a draft opens from a contact row")
else fail("clicking write on a contact opened nothing")
if (/Connection note/.test(writer) && /Referral ask/.test(writer)) pass("LinkedIn drafts offered")
else fail("no LinkedIn-specific drafts")

// A connection note over 300 characters cannot be sent at all.
const counter = await page.locator(".pane .card .mono").last().innerText()
console.log(`  connection note: ${counter}`)
if (/over LinkedIn/.test(counter)) fail(`the default connection note exceeds LinkedIn's limit: ${counter}`)
else pass(`connection note fits (${counter})`)

await page.screenshot({ path: join(shots, "12-contacts.png"), fullPage: true })

/* -------------------------------------------------------------- portfolio */

await page.locator('.nav button:has-text("Portfolio")').first().click()
await page.waitForTimeout(600)
const emptyPortfolio = await page.locator(".pane").innerText()
if (/Designed with or for AI/.test(emptyPortfolio)) pass("portfolio criteria measured from the board")
else fail("portfolio view did not list criteria")
// The weights must come from the postings, not from a hardcoded opinion.
if (/\d+%/.test(emptyPortfolio)) pass("criteria carry a measured demand share")
else fail("no demand percentages on the criteria")

await page.locator('button:has-text("add a project")').click()
await page.waitForTimeout(300)
await page.fill('input[placeholder="Rebuilding checkout at …"]', "Payments onboarding")
// Tick three of the ten.
const boxes = page.locator('.pane input[type="checkbox"]')
await boxes.nth(0).check()
await boxes.nth(2).check()
await boxes.nth(4).check()
await page.waitForTimeout(400)
const audited = await page.locator(".pane").innerText()
if (/in none of your work/.test(audited)) pass("uncovered criteria are called out")
else fail("a project covering 3 of 10 criteria produced no gap warnings")
if (/covered, weighted by demand/.test(audited)) pass("coverage is demand-weighted")
else fail("no coverage figure")
await page.screenshot({ path: join(shots, "15-portfolio.png"), fullPage: true })

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


/* --- the board says how stale a role is, not just how old ---------------- */
await page.locator('.nav button:has-text("Board")').first().click()
await page.waitForTimeout(900)

const warnAges = await page.locator(".job-when.when-warn").allInnerTexts()
const badAges = await page.locator(".job-when.when-bad").allInnerTexts()
const plainAges = await page.locator(".job-when.dimmer").allInnerTexts()

// Every flagged row must state a real number. "1mo ago" is the rounding that
// hid a 52-day posting.
if (warnAges.every((t) => /^\d+d open$/.test(t))) pass("flagged rows show an exact age")
else fail(`flagged rows rounded their age: ${warnAges.slice(0, 4).join(" | ")}`)

if (badAges.every((t) => /^\d+mo open$/.test(t))) pass("very old rows are counted in months")
else fail(`bad-age rows mislabelled: ${badAges.slice(0, 4).join(" | ")}`)

// Colour comes from the age signal alone; a fresh-but-vague posting must not
// paint its date amber.
const tooFresh = warnAges.filter((t) => Number(t.match(/^(\d+)d/)?.[1] ?? 0) <= 30)
if (tooFresh.length === 0) pass("nothing under a month is flagged as stale")
else fail(`fresh roles flagged stale: ${tooFresh.join(" | ")}`)

if (plainAges.every((t) => !/open$/.test(t))) pass("unflagged rows keep the relative wording")
else fail(`unflagged rows changed wording: ${plainAges.slice(0, 4).join(" | ")}`)

const ghostTags = await page.locator(".tag-stale").count()
if (ghostTags === badAges.length) pass(`the ghost tag rides only with a bad age (${ghostTags})`)
else fail(`ghost tags ${ghostTags} but ${badAges.length} bad ages`)

await browser.close()
console.log(failures ? `\nFAIL — ${failures} problem(s)` : "\nPASS — seeded views all render")
process.exit(failures ? 1 : 0)

/**
 * Does the bookmarklet actually fill a real application form?
 *
 * Runs the generated script against cached/live ATS pages where those pages are
 * server-rendered, plus representative fixtures for the client-rendered systems
 * that are hard to fetch in CI (Workday, SmartRecruiters, iCIMS, Workable).
 * The failure mode we care about is practical: fill identity/contact/profile
 * fields, do not submit, do not touch referrals/emergency/preferred-name fields,
 * and do not spray portfolio links into unrelated social boxes.
 *
 *   node test/autofill.test.mjs            # uses cached HTML if present
 *   node test/autofill.test.mjs --refresh  # re-fetch the pages
 */

import { JSDOM } from "jsdom"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const cacheDir = join(here, ".cache")
const refresh = process.argv.includes("--refresh")

const PAGES = [
  { name: "greenhouse", url: "https://job-boards.greenhouse.io/hackerrank/jobs/8018143" },
  { name: "lever", url: "https://jobs.lever.co/zeta/542861ab-f44c-4b51-b6c4-496db7821f1b/apply" },
  { name: "ashby", url: "https://jobs.ashbyhq.com/Linear/eac7f181-d658-4943-9430-51bae2bcd110" },
]

const FIXTURES = [
  {
    name: "workday",
    html: `
      <form>
        <input data-automation-id="firstName" />
        <input data-automation-id="lastName" />
        <input data-automation-id="email" />
        <input data-automation-id="phone-number" />
        <input data-automation-id="linkedinQuestion" />
        <input data-automation-id="personalWebsite" />
        <input data-automation-id="currentResidence" />
        <input data-automation-id="preferredName" />
      </form>
    `,
  },
  {
    name: "smartrecruiters",
    html: `
      <form>
        <label>First name<input name="candidate.firstName" /></label>
        <label>Last name<input name="candidate.lastName" /></label>
        <label>Email<input name="candidate.email" /></label>
        <label>Phone number<input name="candidate.phoneNumber" /></label>
        <label>LinkedIn Profile<input name="candidate.linkedinUrl" /></label>
        <label>Website<input name="candidate.website" /></label>
        <label>Referral source<input name="candidate.referral" /></label>
      </form>
    `,
  },
  {
    name: "icims",
    html: `
      <form>
        <label for="jsb_form_firstName">First Name</label><input id="jsb_form_firstName" />
        <label for="jsb_form_lastName">Last Name</label><input id="jsb_form_lastName" />
        <label for="jsb_form_email">Email Address</label><input id="jsb_form_email" />
        <label for="jsb_form_phone">Mobile Phone</label><input id="jsb_form_phone" />
        <label for="jsb_form_linkedin">LinkedIn URL</label><input id="jsb_form_linkedin" />
        <label for="jsb_form_website">Personal Website</label><input id="jsb_form_website" />
        <label for="jsb_form_emergency">Emergency Contact</label><input id="jsb_form_emergency" />
      </form>
    `,
  },
  {
    name: "workable",
    html: `
      <form>
        <input name="candidate[name]" aria-label="Full name" />
        <input name="candidate[email]" aria-label="Email" />
        <input name="candidate[phone]" aria-label="Phone" />
        <input name="candidate[headline]" aria-label="Current location" />
        <input name="candidate[linkedin_url]" aria-label="LinkedIn" />
        <input name="candidate[website]" aria-label="Portfolio / Website" />
        <input name="candidate[github]" aria-label="GitHub" />
      </form>
    `,
  },
  {
    name: "generic",
    html: `
      <form>
        <input autocomplete="given-name" />
        <input autocomplete="family-name" />
        <input autocomplete="email" />
        <input autocomplete="tel" />
        <textarea aria-label="Portfolio, website, or work samples"></textarea>
        <input title="Where are you based?" />
        <input aria-describedby="refhelp" /><div id="refhelp">Were you referred by anyone?</div>
      </form>
    `,
  },
]

const PROFILE = {
  first_name: "Kousik",
  last_name: "Dutta",
  full_name: "Kousik Dutta",
  email: "kousik@example.com",
  phone: "+91 98765 43210",
  linkedin: "https://linkedin.com/in/kousikdutta",
  portfolio: "https://kousikdutta.com",
  location: "Bengaluru, India",
}

/** Pull the filler source out of the TypeScript module without a build step. */
function fillerSource() {
  const ts = readFileSync(join(here, "..", "src", "lib", "autofill.ts"), "utf8")
  const open = "const FILLER = `"
  const start = ts.indexOf(open) + open.length
  const end = ts.indexOf("`\n\nexport function bookmarkletFor")
  if (start < open.length || end < 0) throw new Error("could not locate FILLER in autofill.ts")
  // The template literal escapes backslashes for TypeScript; undo that so the
  // regexes are what a browser would actually see.
  return ts.slice(start, end).replace(/\\\\/g, "\\")
}

async function html(page) {
  mkdirSync(cacheDir, { recursive: true })
  const file = join(cacheDir, `${page.name}.html`)
  if (!refresh && existsSync(file)) return readFileSync(file, "utf8")
  const res = await fetch(page.url, { headers: { "User-Agent": "Mozilla/5.0" } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.text()
  writeFileSync(file, body)
  return body
}

function run(source, markup) {
  const dom = new JSDOM(markup, {
    url: "https://example.com",
    pretendToBeVisual: true,
    // window.eval only reaches document and friends when scripts are enabled.
    runScripts: "outside-only",
  })
  const { window } = dom
  window.eval(source.replace("__PROFILE__", JSON.stringify(PROFILE)))

  const filled = []
  for (const el of window.document.querySelectorAll("input,textarea")) {
    const kind = (el.type || "").toLowerCase()
    if (kind === "radio" || kind === "checkbox" || kind === "hidden") continue
    if (el.value) {
      filled.push({
        key:
          el.id ||
          el.name ||
          el.getAttribute("aria-label") ||
          el.getAttribute("data-automation-id") ||
          el.getAttribute("data-testid") ||
          el.getAttribute("title") ||
          "?",
        label: el.getAttribute("aria-label") || "",
        value: el.value,
      })
    }
  }
  return filled
}

const EXPECT = {
  greenhouse: [
    ["first_name", PROFILE.first_name],
    ["last_name", PROFILE.last_name],
    ["email", PROFILE.email],
    ["phone", PROFILE.phone],
  ],
  workday: [
    ["?", PROFILE.first_name],
    ["?", PROFILE.last_name],
    ["?", PROFILE.email],
    ["?", PROFILE.phone],
    ["?", PROFILE.linkedin],
    ["?", PROFILE.portfolio],
    ["?", PROFILE.location],
  ],
  smartrecruiters: [
    ["candidate.firstName", PROFILE.first_name],
    ["candidate.lastName", PROFILE.last_name],
    ["candidate.email", PROFILE.email],
    ["candidate.phoneNumber", PROFILE.phone],
    ["candidate.linkedinUrl", PROFILE.linkedin],
    ["candidate.website", PROFILE.portfolio],
  ],
  icims: [
    ["jsb_form_firstName", PROFILE.first_name],
    ["jsb_form_lastName", PROFILE.last_name],
    ["jsb_form_email", PROFILE.email],
    ["jsb_form_phone", PROFILE.phone],
    ["jsb_form_linkedin", PROFILE.linkedin],
    ["jsb_form_website", PROFILE.portfolio],
  ],
  workable: [
    ["candidate[name]", PROFILE.full_name],
    ["candidate[email]", PROFILE.email],
    ["candidate[phone]", PROFILE.phone],
    ["candidate[headline]", PROFILE.location],
    ["candidate[linkedin_url]", PROFILE.linkedin],
    ["candidate[website]", PROFILE.portfolio],
  ],
  generic: [
    ["?", PROFILE.first_name],
    ["?", PROFILE.last_name],
    ["?", PROFILE.email],
    ["?", PROFILE.phone],
    ["?", PROFILE.portfolio],
    ["?", PROFILE.location],
  ],
}

let failures = 0
const source = fillerSource()

async function exercise(page, markup) {
  let filled
  try {
    filled = run(source, markup)
  } catch (error) {
    console.log(`FAIL  ${page.name} — threw: ${error.message}`)
    failures += 1
    return
  }

  const total = new JSDOM(markup).window.document.querySelectorAll("input,textarea").length
  console.log(`\n${page.name.toUpperCase()}  (${total} fields on the page)`)

  if (filled.length === 0) console.log("  nothing filled")
  for (const row of filled) {
    const label = row.label ? `   [${row.label.slice(0, 40)}]` : ""
    console.log(`  ${row.key.padEnd(28)} ${JSON.stringify(row.value)}${label}`)
  }

  const expected = EXPECT[page.name] ?? []
  const remaining = [...filled]
  for (const [key, value] of expected) {
    const index = remaining.findIndex((f) => (key === "?" || f.key === key) && f.value === value)
    if (index === -1) {
      console.log(`  x expected ${value} to be filled${key === "?" ? "" : ` in ${key}`}`)
      failures += 1
    } else {
      remaining.splice(index, 1)
    }
  }

  const wrong = filled.filter((f) => /preferred|referr|emergency|maiden/i.test(f.key + f.label))
  for (const row of wrong) {
    console.log(`  x should not have filled ${row.key}`)
    failures += 1
  }
}

for (const page of PAGES) {
  let markup
  try {
    markup = await html(page)
  } catch (error) {
    console.log(`SKIP  ${page.name} — could not fetch (${error.message})`)
    continue
  }

  await exercise(page, markup)
}

for (const page of FIXTURES) {
  await exercise(page, page.html)
}

console.log(failures === 0 ? "\nPASS - all assertions held" : `\nFAIL - ${failures} assertion(s) failed`)
process.exit(failures === 0 ? 0 : 1)

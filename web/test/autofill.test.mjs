/**
 * Does the bookmarklet actually fill a real application form?
 *
 * Runs the generated script against HTML fetched from live Greenhouse, Lever
 * and Ashby postings rather than a hand-written fixture, because the whole risk
 * with this feature is that a real form is shaped differently from the one you
 * imagined. A fixture would have passed while the real thing failed.
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
        key: el.id || el.name || el.getAttribute("aria-label") || "?",
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
}

let failures = 0
const source = fillerSource()

for (const page of PAGES) {
  let markup
  try {
    markup = await html(page)
  } catch (error) {
    console.log(`SKIP  ${page.name} — could not fetch (${error.message})`)
    continue
  }

  let filled
  try {
    filled = run(source, markup)
  } catch (error) {
    console.log(`FAIL  ${page.name} — threw: ${error.message}`)
    failures += 1
    continue
  }

  const total = new JSDOM(markup).window.document.querySelectorAll("input,textarea").length
  console.log(`\n${page.name.toUpperCase()}  (${total} fields on the page)`)

  if (filled.length === 0) console.log("  nothing filled")
  for (const row of filled) {
    const label = row.label ? `   [${row.label.slice(0, 40)}]` : ""
    console.log(`  ${row.key.padEnd(22)} ${JSON.stringify(row.value)}${label}`)
  }

  for (const [key, value] of EXPECT[page.name] ?? []) {
    const hit = filled.find((f) => f.key === key)
    if (!hit) {
      console.log(`  x expected ${key} to be filled`)
      failures += 1
    } else if (hit.value !== value) {
      console.log(`  x ${key} = ${JSON.stringify(hit.value)}, expected ${JSON.stringify(value)}`)
      failures += 1
    }
  }

  const wrong = filled.filter((f) => /preferred|referr|emergency|maiden/i.test(f.key + f.label))
  for (const row of wrong) {
    console.log(`  x should not have filled ${row.key}`)
    failures += 1
  }
}

console.log(failures === 0 ? "\nPASS - all assertions held" : `\nFAIL - ${failures} assertion(s) failed`)
process.exit(failures === 0 ? 0 : 1)

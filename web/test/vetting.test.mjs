/**
 * The vetting card is the first thing on a job, so it is the easiest place to
 * lose someone's trust. If it calls a thirteen-day-old posting "fresh" once,
 * every other claim on the page becomes negotiable.
 *
 *   node --experimental-strip-types --import ./test/ts-resolve.mjs test/vetting.test.mjs
 */

import { vet, companyFacts } from "../src/lib/vetting.ts"

let failures = 0
const check = (label, ok, detail = "") => {
  if (ok) console.log(`  . ${label}`)
  else {
    console.log(`  x ${label}${detail ? ` — ${detail}` : ""}`)
    failures += 1
  }
}

const job = (days, specificity, extra = {}) => ({
  id: "j",
  title: "Product Designer",
  company: "Test",
  match_score: 80,
  match_reasons: [],
  quality: {
    days_open: days,
    days_open_basis: "ats_posted_date",
    repost_count: null,
    always_open: null,
    description_specificity: specificity,
    description_specificity_method: "",
    company_posting_velocity: {
      current: 1,
      historical_median: null,
      ratio: null,
      status: "not_enough_history",
    },
    history_days: 2,
    verdict: "",
    ...extra,
  },
})

const words = (v) => `${v.headline} ${v.advice}`.toLowerCase()

/* --- the bug that prompted this file ------------------------------------ */
{
  const v = vet(job(13, 0.8))
  check("a 13-day-old posting is never called fresh", !/\bfresh\b/.test(words(v)), v.advice)
  check("but a well-written one is still recommended", v.tone === "good", v.tone)
  check("and the headline says why", /written for a real team/i.test(v.headline), v.headline)
}
{
  const v = vet(job(2, 0.4))
  check("a 2-day-old ordinary posting says get in early", /early/i.test(v.headline), v.headline)
  check("it does not claim the posting is well written", !/specific/i.test(words(v)), v.advice)
}
{
  const v = vet(job(3, 0.9))
  check("fresh AND specific earns the strongest call", /spend the hour/i.test(v.headline), v.headline)
}

/* --- the ghost-job end of the range ------------------------------------- */
{
  const v = vet(job(200, 0.9))
  check("a 200-day-old posting is flagged regardless of how well written", v.tone === "bad", v.tone)
  check("it says to verify before spending time", /check it is real/i.test(v.headline), v.headline)
  const months = v.signals.find((s) => s.label === "Open")
  check("and the age reads in months, not days", /month/.test(months?.value ?? ""), months?.value)
}
{
  const v = vet(job(60, 0.2))
  check("old and vague is worse than either alone", v.tone === "bad", v.tone)
  check("it names the combination", /old and vague/i.test(v.headline), v.headline)
}
{
  const v = vet(job(60, 0.8))
  check("old but specific is a warning, not a verdict", v.tone === "warn", v.tone)
}
{
  const v = vet(job(5, 0.1))
  check("fresh but empty warns about the posting, not the age", v.tone === "warn", v.tone)
  check("it tells you to find a person", /find someone|reach a human/i.test(words(v)), v.advice)
}

/* --- never invent -------------------------------------------------------- */
{
  const bare = { id: "j", title: "T", company: "C", match_score: 1, match_reasons: [] }
  const v = vet(bare)
  check("a job with no quality block produces no claims", v.signals.length === 0, `${v.signals.length}`)
  check("and says so plainly", /ordinary/i.test(v.headline), v.headline)
}
{
  const v = vet(job(3, 0.9), { name: "X", domain: null, facts: {} })
  check("an empty dossier adds nothing", v.signals.every((s) => s.label !== "Founded"))
}

/* --- company facts must always be checkable ------------------------------ */
{
  const facts = companyFacts({
    name: "Adobe",
    domain: "adobe.com",
    facts: {
      founded: { value: "1982-02-28", source: "https://query.wikidata.org/sparql", as_of: "2026-08-13" },
      employee_count: { value: "25988", source: "https://query.wikidata.org/sparql", as_of: "2026-08-13" },
      headquarters: { value: "San Jose", source: "https://query.wikidata.org/sparql", as_of: "2026-08-13" },
      wikidata_id: { value: "Q11463", source: "https://query.wikidata.org/sparql", as_of: "2026-08-13" },
    },
  })
  check("every fact carries a source", facts.every((f) => !!f.source), JSON.stringify(facts))
  const founded = facts.find((f) => f.label === "Founded")
  check("founded shows the age, not a raw date", /1982 · \d+ years old/.test(founded?.value ?? ""), founded?.value)
  const size = facts.find((f) => f.label === "Employees")
  check("headcount is grouped for reading", /,/.test(size?.value ?? ""), size?.value)
  check("internal ids are not shown", !facts.some((f) => /Q11463/.test(f.value)))
}

console.log(failures ? `\nFAIL — ${failures} problem(s)` : "\nPASS — the card only claims what it knows")
process.exit(failures ? 1 : 0)

/**
 * A gap in your writing is not a gap in your experience.
 *
 * The board scores you against profile.json; the ATS only ever reads your
 * resume. Before this split, one screen said "overlaps your strengths:
 * enterprise" and, four inches below, listed "enterprise" under what you were
 * missing. Both were true of different documents, which is exactly the kind of
 * self-contradiction that makes a tool untrustworthy.
 */
import { matchResume } from "../src/lib/resume.ts"

let passed = 0
let failed = 0
const pass = (m) => {
  passed++
  console.log(`. ${m}`)
}
const fail = (m) => {
  failed++
  console.log(`x ${m}`)
}
const ok = (cond, m) => (cond ? pass(m) : fail(m))

const JOB = {
  title: "Senior Product Designer",
  description_text: "",
  keywords: ["enterprise", "figma", "interaction design", "kubernetes", "visual design"],
  keyword_groups: {
    domain: ["enterprise", "kubernetes"],
    craft: ["figma", "interaction design", "visual design"],
  },
}
const IDF = {
  enterprise: 2.1,
  figma: 1.2,
  "interaction design": 1.9,
  kubernetes: 3.4,
  "visual design": 1.5,
}

// Says figma and interaction design. Never says enterprise, kubernetes or
// visual design.
const RESUME = `Kousik Dutta — Senior Product Designer.
Built design systems in Figma. Led interaction design for a payments console.`

const STRENGTHS = ["enterprise", "figma", "interaction design", "visual design"]

const withProfile = matchResume(RESUME, JOB, IDF, STRENGTHS)
const noProfile = matchResume(RESUME, JOB, IDF, [])

const terms = (list) => list.map((g) => g.term).sort()

ok(
  terms(withProfile.missing).join() === "enterprise,kubernetes,visual design",
  `all three absent terms are still missing (${terms(withProfile.missing).join(", ")})`,
)

ok(
  terms(withProfile.unwritten).join() === "enterprise,visual design",
  `only the claimed ones are free wins (${terms(withProfile.unwritten).join(", ")})`,
)

ok(
  !withProfile.unwritten.some((g) => g.term === "kubernetes"),
  "kubernetes is never a free win — it is not in the profile",
)

ok(
  withProfile.unwritten.every((g) => STRENGTHS.includes(g.term)),
  "every free win is a term the profile actually claims",
)

ok(
  withProfile.unwritten.every((g) => !withProfile.covered.some((c) => c.term === g.term)),
  "a free win is never also reported as covered",
)

// The split must not move the number. If passing strengths changed the score,
// the same resume would score differently on two screens — swapping one
// contradiction for another.
ok(
  withProfile.score === noProfile.score,
  `score is unchanged by the profile (${withProfile.score} === ${noProfile.score})`,
)
ok(
  withProfile.missing.length === noProfile.missing.length,
  "the missing list is unchanged in length by the profile",
)

// Negative control: without the profile, nothing can be labelled a free win,
// so the whole feature collapses into the old undifferentiated list.
ok(
  noProfile.unwritten.length === 0,
  "negative control — with no profile there are no free wins, only gaps",
)

// Claiming something you already wrote is not a gap at all.
const overclaim = matchResume(RESUME, JOB, IDF, ["figma"])
ok(
  overclaim.unwritten.length === 0,
  "a claimed term that is already in the resume is not surfaced as unwritten",
)

// Ordering: the detail view filters `missing` by !claimed, so the two lists
// must partition cleanly with no term appearing in both rendered cards.
const shown = withProfile.missing.filter((g) => !g.claimed).map((g) => g.term)
ok(
  shown.length + withProfile.unwritten.length === withProfile.missing.length,
  "the two rendered cards partition the missing list exactly, with no overlap",
)
ok(shown.join() === "kubernetes", `only genuine gaps remain in the second card (${shown.join()})`)

console.log(
  failed === 0
    ? `\nPASS — ${passed} assertions`
    : `\nFAIL — ${failed} of ${passed + failed} assertions`,
)
process.exit(failed === 0 ? 0 : 1)

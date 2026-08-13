/**
 * A criterion must match a word, not a run of letters.
 *
 * `criteria()` counted a posting as asking for AI if its text contained the
 * substring "ai". That is inside detail, email, available, maintain, Chennai
 * and training, so 95% of the board appeared to want AI experience. The real
 * figure is 66%. The number is not decoration: criteria are sorted by demand
 * and the portfolio to-do list is built from that order, so the inflation put
 * "Designed with or for AI" at the top of the user's career advice when the
 * genuine top gap is "A number at the end".
 */
import { criteria } from "../src/lib/portfolio.ts"

let passed = 0
let failed = 0
const ok = (cond, m) => {
  if (cond) {
    passed++
    console.log(`. ${m}`)
  } else {
    failed++
    console.log(`x ${m}`)
  }
}

const job = (id, description_text) => ({
  id,
  title: "Product Designer",
  company: "Acme",
  eligible: true,
  keywords: [],
  description_text,
})

// Every one of these contains "ai" as a run of letters and none of them is an
// AI role. Two mention accessibility, which is a real term and must survive.
const DECOYS = [
  "Attention to detail is essential for this role.",
  "Please email us and we will explain the process.",
  "The successful candidate will maintain the component library.",
  "Based in Chennai, with travel to Bengaluru.",
  "We will provide training and a clear promotion path.",
  "Positions are available across the retail portfolio.",
  "You will work on accessibility and contrast ratios.",
  "Certain projects require a chair of the design council.",
]
const decoyJobs = DECOYS.map((t, i) => job(`d${i}`, t))

const aiOf = (jobs) => criteria(jobs).find((c) => c.key === "ai")

const decoyAi = aiOf(decoyJobs)
ok(decoyAi.demandCount === 0, `no decoy counts as an AI role (counted ${decoyAi.demandCount})`)
ok(decoyAi.demand === 0, "so demand for AI is zero, not 100%")

// The real thing must still be found, including inside a sentence.
const REAL = [
  "You will design AI-powered workflows.",
  "Experience with LLM interfaces preferred.",
  "We are building agentic tooling for developers.",
  "Background in machine learning products.",
  "Shipped features alongside Copilot.",
  "Generative AI is central to the roadmap.",
]
const realAi = aiOf(REAL.map((t, i) => job(`r${i}`, t)))
ok(realAi.demandCount === REAL.length, `every genuine AI posting is found (${realAi.demandCount}/6)`)

// Mixed corpus: the proportion must be exactly the genuine half.
const mixed = [...decoyJobs, ...REAL.map((t, i) => job(`r${i}`, t))]
const mixedAi = aiOf(mixed)
ok(mixedAi.demandCount === 6, `mixed corpus counts only the 6 real ones (${mixedAi.demandCount})`)
ok(
  Math.round(mixedAi.demand * 100) === Math.round((6 / 14) * 100),
  `demand is the honest fraction (${Math.round(mixedAi.demand * 100)}%)`,
)

// Ordering is the thing the user actually acts on.
const withOutcome = [
  ...decoyJobs,
  ...["We measure conversion and impact.", "Analytics-led team.", "Growth experimentation."].map(
    (t, i) => job(`o${i}`, t),
  ),
]
const ranked = criteria(withOutcome)
ok(
  ranked[0].key !== "ai",
  `AI does not top a board that never mentions it (top is ${ranked[0].key})`,
)
ok(
  ranked.findIndex((c) => c.key === "outcome") < ranked.findIndex((c) => c.key === "ai"),
  "a criterion with real evidence outranks one with none",
)

// Other criteria have the same class of decoy.
const promo = criteria([job("p", "There is a clear promotion path and a pension.")])
ok(
  promo.find((c) => c.key === "craft").demandCount === 0,
  "promotion does not count as motion design",
)
const air = criteria([job("a", "Our client works in aircraft manufacturing.")])
ok(air.find((c) => c.key === "craft").demandCount === 0, "aircraft does not count as craft")

// Word boundaries must not break legitimate multi-word or punctuated terms.
const punct = criteria([job("x", "You will run A/B tests and 0 to 1 product work.")])
ok(punct.find((c) => c.key === "outcome").demandCount === 1, "a/b still matches with a slash in it")
ok(punct.find((c) => c.key === "ambiguity").demandCount === 1, "0 to 1 still matches with digits")

const hyphen = criteria([job("h", "Design AI-powered flows.")])
ok(
  hyphen.find((c) => c.key === "ai").demandCount === 1,
  "a hyphen is a boundary, so AI-powered counts",
)

console.log(
  failed === 0
    ? `\nPASS — ${passed} assertions on criterion matching`
    : `\nFAIL — ${failed} of ${passed + failed}`,
)
process.exit(failed ? 1 : 0)

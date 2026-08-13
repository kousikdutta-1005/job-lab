/**
 * The funnel's whole job is to name the step that is leaking, and the wrong
 * name sends you off optimising the thing that already works. These are the
 * four shapes a design job search actually takes.
 *
 *   node --experimental-strip-types test/funnel.test.mjs
 */

import { funnel } from "../src/lib/funnel.ts"

let failures = 0
const check = (label, condition, detail = "") => {
  if (condition) console.log(`  . ${label}`)
  else {
    console.log(`  x ${label}${detail ? ` — ${detail}` : ""}`)
    failures += 1
  }
}

const app = (stage, opts = {}) => ({
  id: Math.random().toString(36).slice(2),
  job_id: null,
  title: "Product Designer",
  company: opts.company ?? "Acme",
  url: "",
  location: "",
  work_mode: "remote",
  stage,
  date_saved: "2026-01-01",
  date_applied: opts.applied === false ? undefined : "2026-01-02",
  contact_ids: [],
  activities: opts.activities ?? [],
})

const many = (n, stage, opts) => Array.from({ length: n }, () => app(stage, opts))

/* --- nothing yet ------------------------------------------------------- */
{
  const f = funnel([])
  check("empty tracker says nothing rather than 0%", /nothing to count/i.test(f.verdict))
  check("empty tracker names no weakest step", f.weakest === null)
}

/* --- too small to read ------------------------------------------------- */
{
  const f = funnel([...many(4, "rejected"), ...many(2, "applied")])
  check("six applications is declared too few", f.enough === false)
  check("small sample names no weakest step", f.weakest === null, JSON.stringify(f.weakest))
  check("small sample still counts", f.steps[0].count === 6)
}

/* --- silence: the top is leaking --------------------------------------- */
{
  // 30 applied, only 2 ever answered.
  const f = funnel([...many(28, "applied"), ...many(2, "rejected")])
  check("30 applications is enough to read", f.enough === true)
  check("silence is diagnosed at the reply step", f.weakest?.key === "replied", f.weakest?.key)
  check(
    "verdict warns against sending more at that rate",
    /more silence|more applications/i.test(f.verdict),
    f.verdict,
  )
  check("reply rate is 2 of 30", Math.round((f.steps[1].rate ?? 0) * 100) === 7)
}

/* --- replies fine, screens die ----------------------------------------- */
{
  // 20 applied, 8 answered, 6 screened, 1 interview → screen→interview is 17%.
  const f = funnel([
    ...many(12, "applied"),
    ...many(2, "rejected"),
    ...many(5, "phone_screen"),
    ...many(1, "interview"),
  ])
  check("dying at the screen is diagnosed there", f.weakest?.key === "interview", f.weakest?.key)
  check(
    "verdict says it is narrative, not resume",
    /narrative|positioning|two-minute/i.test(f.verdict),
    f.verdict,
  )
}

/* --- interviews but no offer ------------------------------------------- */
{
  const f = funnel([...many(6, "applied"), ...many(4, "rejected"), ...many(4, "interview")])
  check("interviews with no offer is diagnosed at the offer step", f.weakest?.key === "offer", f.weakest?.key)
  check(
    "verdict tells you to stop optimising the top",
    /stop optimising|portfolio walkthrough/i.test(f.verdict),
    f.verdict,
  )
}

/* --- a rejection is a response ----------------------------------------- */
{
  const f = funnel(many(20, "rejected"))
  check("20 rejections is a 100% response rate, not 0%", f.steps[1].count === 20)
  check("all-rejections is not diagnosed as a silence problem", f.weakest?.key !== "replied")
}

/* --- never applied does not count -------------------------------------- */
{
  const f = funnel([...many(5, "wishlist", { applied: false }), ...many(3, "applied")])
  check("shortlisted-but-not-applied is excluded from the denominator", f.steps[0].count === 3)
}

console.log(failures ? `\nFAIL — ${failures} problem(s)` : "\nPASS — funnel reads every shape correctly")
process.exit(failures ? 1 : 0)

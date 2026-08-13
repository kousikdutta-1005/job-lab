/**
 * The two halves of the tool are only worth building if they talk to each
 * other. The funnel knows the search is stalling at interviews; the portfolio
 * audit knows what the case studies never show. Separately those are two
 * dashboards. Together they name the thing being asked in the room that you
 * have no answer to — and that has to escalate, not sit at the bottom of a
 * housekeeping list.
 *
 *   node --experimental-strip-types test/diagnosis.test.mjs
 */

import { briefing } from "../src/lib/briefing.ts"
import { readFileSync } from "node:fs"

const bundle = JSON.parse(readFileSync("public/data/jobs.json", "utf8"))
const idf = JSON.parse(readFileSync("public/data/idf.json", "utf8"))
const jobs = bundle.jobs

let failures = 0
const check = (label, condition, detail = "") => {
  if (condition) console.log(`  . ${label}`)
  else {
    console.log(`  x ${label}${detail ? ` — ${detail}` : ""}`)
    failures += 1
  }
}

const settings = {
  full_name: "Kousik Dutta",
  email: "k@example.com",
  phone: "+91",
  portfolio: "https://example.com",
  linkedin: "",
  location: "Bengaluru, India",
  years: 5,
  resume_text: "product designer figma design system prototyping user research accessibility",
  resume_name: "cv.pdf",
  current_ctc: 2200000,
}

const app = (stage, i) => ({
  id: `a${i}`,
  job_id: null,
  title: "Product Designer",
  company: `Company ${i}`,
  url: "",
  location: "Bengaluru, India",
  work_mode: "hybrid",
  stage,
  date_saved: "2026-01-01",
  date_applied: "2026-01-02",
  contact_ids: [],
  activities: [],
})

const many = (n, stage, offset = 0) =>
  Array.from({ length: n }, (_, i) => app(stage, i + offset))

const project = (met) => ({ id: "p1", name: "Case study", url: "", met })

const kinds = (actions) => actions.map((a) => a.kind)
const find = (actions, kind) => actions.find((a) => a.kind === kind)

/* --- interviews not converting, and the portfolio explains why ---------- */
{
  // Everything covered except accessibility.
  const covered = {
    outcome: true,
    research: true,
    systems: true,
    craft: true,
    engineering: true,
    ambiguity: true,
    leadership: true,
    ai: true,
    domain: true,
    accessibility: false,
  }
  const applications = [...many(8, "rejected"), ...many(4, "interview", 100)]
  const actions = briefing(jobs, applications, [], settings, idf, [project(covered)])
  const portfolio = find(actions, "portfolio")
  check("a portfolio gap is raised", !!portfolio, kinds(actions).join(","))
  check(
    "it escalates when interviews are not converting",
    (portfolio?.urgency ?? 0) >= 90,
    `urgency ${portfolio?.urgency}`,
  )
  check(
    "it says why, naming the interviews",
    /interviews and no offer/i.test(portfolio?.detail ?? ""),
    portfolio?.detail?.slice(0, 90),
  )
  const funnelAction = find(actions, "funnel")
  check("the funnel diagnosis appears alongside it", !!funnelAction)
  check(
    "the funnel says to stop tuning the top",
    /stop tuning|stop optimising/i.test(`${funnelAction?.title} ${funnelAction?.detail}`),
    funnelAction?.title,
  )
}

/* --- same gap, but no evidence the portfolio is the problem ------------- */
{
  const covered = {
    outcome: true,
    research: true,
    systems: true,
    craft: true,
    engineering: true,
    ambiguity: true,
    leadership: true,
    ai: true,
    domain: true,
    accessibility: false,
  }
  // Applied a lot, nothing has reached an interview: the portfolio is not
  // the bottleneck yet, so the same gap must sit quietly.
  const actions = briefing(jobs, many(12, "applied"), [], settings, idf, [project(covered)])
  const portfolio = find(actions, "portfolio")
  check("the same gap is still raised", !!portfolio)
  check(
    "but quietly, because nothing shows it is the bottleneck",
    (portfolio?.urgency ?? 99) < 80,
    `urgency ${portfolio?.urgency}`,
  )
  const funnelAction = find(actions, "funnel")
  check(
    "the funnel blames the top instead",
    /not fix this|silence/i.test(`${funnelAction?.title} ${funnelAction?.detail}`),
    funnelAction?.title,
  )
}

/* --- no projects yet ---------------------------------------------------- */
{
  const quiet = briefing(jobs, many(2, "applied"), [], settings, idf, [])
  check(
    "with two applications it does not nag about the portfolio",
    !find(quiet, "portfolio"),
  )
  const busy = briefing(jobs, many(8, "applied"), [], settings, idf, [])
  check("with eight it does", !!find(busy, "portfolio"))
}

/* --- an offer still outranks everything -------------------------------- */
{
  const applications = [
    ...many(8, "rejected"),
    ...many(4, "interview", 100),
    { ...app("offer", 999), salary_min: 3800000 },
  ]
  const actions = briefing(jobs, applications, [], settings, idf, [project({ accessibility: false })])
  check("an offer still leads everything", actions[0]?.kind === "offer", actions[0]?.kind)
}

/* --- the queue must not argue with itself ------------------------------- */
{
  // A job old enough for the vetting card to distrust must never also be
  // recommended as a plain "apply to this". The queue used to name the same
  // company in both, two rows apart.
  const stale = jobs.filter((j) => j.eligible && (j.quality?.days_open ?? 0) > 30)
  const actions = briefing(jobs, [], [], settings, idf, [])
  const applyIds = new Set(actions.filter((a) => a.kind === "apply").map((a) => a.jobId))
  const overlap = stale.filter((j) => applyIds.has(j.id))
  check(
    "no stale role is offered as a straight apply",
    overlap.length === 0,
    overlap.slice(0, 3).map((j) => `${j.company} ${j.quality?.days_open}d`).join(", "),
  )

  const expiring = actions.filter((a) => a.kind === "expiring")
  check("stale roles are collapsed into at most two cards", expiring.length <= 2, `${expiring.length}`)
  check(
    "and none of them tells you to apply now",
    !expiring.some((a) => /apply now/i.test(a.detail)),
    expiring.map((a) => a.detail.slice(0, 60)).join(" | "),
  )
  const veryOld = actions.find((a) => a.id.startsWith("ghost-"))
  if (veryOld) {
    check(
      "postings over 90 days are ranked below fresh applications",
      veryOld.urgency < 70,
      `urgency ${veryOld.urgency}`,
    )
  }
}

console.log(
  failures ? `\nFAIL — ${failures} problem(s)` : "\nPASS — the funnel and the portfolio agree",
)
process.exit(failures ? 1 : 0)

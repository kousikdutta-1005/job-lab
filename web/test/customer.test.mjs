import { blackHoleRead, burnoutPlan, interviewStoryBank, linkedinBridge } from "../src/lib/customer.ts"

let failures = 0
const check = (label, condition, detail = "") => {
  if (condition) console.log(`  . ${label}`)
  else {
    console.log(`  x ${label}${detail ? ` — ${detail}` : ""}`)
    failures += 1
  }
}

const oldDate = new Date(Date.now() - 24 * 86_400_000).toISOString().slice(0, 10)
const weekDate = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10)

const job = {
  id: "j1",
  title: "Senior Product Designer",
  company: "Acme",
  company_slug: "acme",
  source: "greenhouse",
  url: "",
  location_raw: "Bengaluru",
  description_text: "Design systems, research, metrics, collaboration",
  department: "Design",
  posted_at: new Date().toISOString().slice(0, 10),
  salary: null,
  salary_parsed: null,
  workplace: "remote",
  cities: ["Bengaluru"],
  points: [],
  india: true,
  region_lock: null,
  eligible: true,
  eligibility_reason: "Eligible",
  seniority: "senior",
  seniority_label: "Senior",
  years_min: 5,
  years_max: null,
  keywords: ["design systems", "research", "metrics", "collaboration"],
  keyword_groups: { design: ["design systems", "research", "metrics", "collaboration"] },
  company_domain: "acme.com",
  email_pattern: null,
  email_pattern_confidence: "none",
  linkedin: { company_page: "", people: "", jobs: "", searches: [] },
  match_score: 88,
  match_reasons: ["Strong fit"],
  quality: {
    days_open: 2,
    days_open_basis: "ats_posted_date",
    repost_count: null,
    always_open: false,
    description_specificity: 0.8,
    description_specificity_method: "test",
    company_posting_velocity: { current: 1, historical_median: null, ratio: null, status: "not_enough_history" },
    history_days: 1,
    verdict: "test",
  },
}

const app = (stage, patch = {}) => ({
  id: Math.random().toString(36),
  job_id: "j1",
  title: "Senior Product Designer",
  company: "Acme",
  url: "",
  location: "Bengaluru",
  work_mode: "remote",
  stage,
  date_saved: "2026-08-01",
  date_applied: patch.date_applied ?? "2026-08-01",
  contact_ids: [],
  activities: patch.activities ?? [],
})

{
  const guard = burnoutPlan(
    [
      app("interview"),
      app("applied", { date_applied: weekDate }),
      app("applied", { date_applied: weekDate }),
      app("applied", { date_applied: weekDate }),
    ],
    6,
  )
  check("burnout guard protects attention when interviews or stale follow-ups exist", guard.mode === "protect")
  check("protect mode caps new applications", guard.quota <= 1)
}

{
  const guard = burnoutPlan([], 8)
  check("burnout guard allows a push when pipeline is empty", guard.mode === "push")
  check("push mode still caps quality applications", guard.quota === 3)
}

{
  const read = blackHoleRead(app("applied", { date_applied: oldDate }), job)
  check("black-hole decoder calls out long silence", read.tone === "bad", read.headline)
  check("black-hole decoder recommends human revival/archive", /human|archive/i.test(read.detail), read.detail)
}

{
  const read = blackHoleRead(app("applied", { date_applied: weekDate }), job)
  check("one-week silence earns one follow-up", read.tone === "warn")
}

{
  const checklist = linkedinBridge(
    job,
    { full_name: "", email: "", phone: "", portfolio: "https://portfolio.test", linkedin: "", location: "", years: 5, resume_text: "", resume_name: "" },
    { titleScore: 80, weightedCoverage: 0.7 },
  )
  check("LinkedIn bridge asks for profile URL", checklist.some((item) => item.label === "Profile URL ready" && !item.ready))
  check("LinkedIn bridge ties featured proof to JD terms", checklist.some((item) => /design systems/.test(item.detail)))
}

{
  const stories = interviewStoryBank(job, { missing: [{ term: "metrics", claimed: false }] })
  check("story bank includes business impact", stories.some((story) => /business impact/i.test(story.question)))
  check("story bank names honest gap handling", stories.some((story) => /metrics/.test(story.question)))
}

console.log(failures ? `\nFAIL — ${failures} problem(s)` : "\nPASS — customer pain points are translated into workflow features")
process.exit(failures ? 1 : 0)

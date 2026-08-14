import { learnOutcomes, worthYourHour } from "../src/lib/outcomes.ts"

let failures = 0
const check = (label, condition, detail = "") => {
  if (condition) console.log(`  . ${label}`)
  else {
    console.log(`  x ${label}${detail ? ` — ${detail}` : ""}`)
    failures += 1
  }
}

const job = (id, patch = {}) => ({
  id,
  title: "Senior Product Designer",
  company: patch.company ?? "Acme",
  company_slug: "acme",
  source: patch.source ?? "greenhouse",
  url: "https://example.com/job",
  location_raw: patch.city ?? "Bengaluru, India",
  description_text: "Design systems, user research, metrics and product strategy.",
  department: "Design",
  posted_at: "2026-08-10",
  salary: null,
  salary_parsed: patch.salary ?? null,
  workplace: patch.workplace ?? "remote",
  cities: [patch.city ?? "Bengaluru"],
  points: [],
  india: true,
  region_lock: null,
  eligible: true,
  eligibility_reason: "Eligible",
  seniority: patch.seniority ?? "senior",
  seniority_label: patch.seniorityLabel ?? "Senior",
  years_min: 5,
  years_max: null,
  keywords: ["design systems", "research", "metrics"],
  keyword_groups: { design: ["design systems", "research", "metrics"] },
  company_domain: "acme.com",
  email_pattern: null,
  email_pattern_confidence: "none",
  linkedin: {
    company_page: "",
    people: "",
    jobs: "",
    searches: [{ label: "Head of Design", url: "https://linkedin.com", kind: "decision-maker" }],
  },
  match_score: patch.match ?? 88,
  match_reasons: ["Overlaps with senior product design strengths."],
  quality: {
    days_open: patch.days ?? 3,
    days_open_basis: "ats_posted_date",
    repost_count: null,
    always_open: false,
    description_specificity: patch.specificity ?? 0.7,
    description_specificity_method: "test",
    company_posting_velocity: {
      current: 1,
      historical_median: null,
      ratio: null,
      status: "not_enough_history",
    },
    history_days: 1,
    verdict: "test",
  },
})

const app = (job_id, stage, company = "Acme") => ({
  id: `${job_id}-${stage}-${Math.random()}`,
  job_id,
  title: "Senior Product Designer",
  company,
  url: "",
  location: "Bengaluru",
  work_mode: "remote",
  stage,
  date_saved: "2026-08-01",
  date_applied: "2026-08-01",
  contact_ids: [],
  activities: [],
})

const remote = job("remote", { workplace: "remote", source: "greenhouse", city: "Bengaluru" })
const onsite = job("onsite", { workplace: "onsite", source: "workday", city: "Mumbai", match: 70, days: 80 })
const jobs = [remote, onsite]

{
  const learning = learnOutcomes(
    [
      ...Array.from({ length: 8 }, () => app("remote", "phone_screen")),
      ...Array.from({ length: 4 }, () => app("onsite", "applied")),
    ],
    jobs,
  )
  check("learns after ten applications", learning.applied === 12)
  check("learns remote work is a best converting segment", learning.segments.some((s) => s.key === "work:remote" && s.lift > 0.3))
  check("computes reply rate", Math.round((learning.replyRate ?? 0) * 100) === 67)
  check("reports segment lift", learning.segments.some((s) => s.key === "work:remote" && s.lift > 0.3))
}

{
  const score = worthYourHour(
    remote,
    Array.from({ length: 10 }, () => app("remote", "phone_screen")),
    [{ id: "c1", name: "Priya", title: "Design Director", company: "Acme", relationship: "hiring_manager", added: "2026-08-01" }],
    jobs,
    82,
    true,
  )
  check("high-fit fresh role with human path is worth applying properly", score.score >= 78, String(score.score))
  check("worth score includes ATS signal", score.signals.some((s) => s.label === "ATS" && s.tone === "good"))
}

{
  const score = worthYourHour(onsite, [], [], jobs, 40, false)
  check("old weaker role is not treated like a full-application target", score.score < 62, String(score.score))
  check("old role carries ghost-risk freshness signal", score.signals.some((s) => s.label === "Freshness" && s.tone === "warn"))
}

console.log(failures ? `\nFAIL — ${failures} problem(s)` : "\nPASS — outcome learning ranks roles from real conversion data")
process.exit(failures ? 1 : 0)

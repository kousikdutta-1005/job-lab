import type { Application, Contact, Job } from "./types"
import { ageTone } from "./vetting"

export interface OutcomeLearning {
  applied: number
  replyRate: number | null
  interviewRate: number | null
  strongestSignal: string
  warningSignal: string
  recommendation: string
  segments: SegmentLearning[]
}

export interface SegmentLearning {
  key: string
  label: string
  applied: number
  replies: number
  interviews: number
  replyRate: number
  interviewRate: number
  lift: number
}

export interface WorthSignal {
  label: string
  value: string
  detail: string
  points: number
  tone: "good" | "warn" | "bad" | "neutral"
}

export interface WorthScore {
  score: number
  label: string
  verdict: string
  signals: WorthSignal[]
  outcomeLift: number
}

const REPLIED = new Set(["phone_screen", "interview", "offer", "accepted", "rejected"])
const INTERVIEWED = new Set(["interview", "offer", "accepted"])

const clamp = (value: number, min = 0, max = 100): number => Math.max(min, Math.min(max, value))

function replied(row: Application): boolean {
  return (
    REPLIED.has(row.stage) ||
    row.activities.some((a) => a.type === "email_sent" || a.type === "call_made" || a.type === "interview" || a.type === "offer")
  )
}

function interviewed(row: Application): boolean {
  return INTERVIEWED.has(row.stage) || row.activities.some((a) => a.type === "interview" || a.type === "offer")
}

function bucket(job: Job): Array<{ key: string; label: string }> {
  const city = job.cities[0] ?? (job.workplace === "remote" ? "Remote" : "Unknown location")
  const payBand = job.salary_parsed?.inr_high
    ? job.salary_parsed.inr_high >= 10_000_000
      ? "high-pay"
      : job.salary_parsed.inr_high >= 6_000_000
        ? "mid-pay"
        : "low-pay"
    : "undisclosed-pay"
  return [
    { key: `source:${job.source}`, label: `Source: ${job.source}` },
    { key: `work:${job.workplace}`, label: `Work mode: ${job.workplace}` },
    { key: `city:${city}`, label: `Market: ${city}` },
    { key: `level:${job.seniority}`, label: `Level: ${job.seniority_label}` },
    { key: `pay:${payBand}`, label: `Pay: ${payBand.replace("-", " ")}` },
    { key: `match:${job.match_score >= 85 ? "high" : job.match_score >= 70 ? "medium" : "low"}`, label: `Fit: ${job.match_score >= 85 ? "85+" : job.match_score >= 70 ? "70-84" : "under 70"}` },
  ]
}

export function learnOutcomes(applications: Application[], jobs: Job[]): OutcomeLearning {
  const byJob = new Map(jobs.map((job) => [job.id, job]))
  const applied = applications.filter((row) => row.date_applied)
  const replies = applied.filter(replied)
  const interviews = applied.filter(interviewed)
  const baselineReply = applied.length ? replies.length / applied.length : 0
  const segmentMap = new Map<string, Omit<SegmentLearning, "replyRate" | "interviewRate" | "lift">>()

  for (const row of applied) {
    const job = row.job_id ? byJob.get(row.job_id) : null
    if (!job) continue
    for (const segment of bucket(job)) {
      const current = segmentMap.get(segment.key) ?? {
        key: segment.key,
        label: segment.label,
        applied: 0,
        replies: 0,
        interviews: 0,
      }
      current.applied += 1
      if (replied(row)) current.replies += 1
      if (interviewed(row)) current.interviews += 1
      segmentMap.set(segment.key, current)
    }
  }

  const segments = [...segmentMap.values()]
    .filter((segment) => segment.applied >= 2)
    .map((segment) => ({
      ...segment,
      replyRate: segment.replies / segment.applied,
      interviewRate: segment.interviews / segment.applied,
      lift: baselineReply ? segment.replies / segment.applied - baselineReply : 0,
    }))
    .sort((a, b) => b.lift - a.lift || b.applied - a.applied)

  const strongest = segments.find((segment) => segment.lift > 0.05)
  const weakest = [...segments].reverse().find((segment) => segment.lift < -0.05)
  const replyRate = applied.length ? replies.length / applied.length : null
  const interviewRate = applied.length ? interviews.length / applied.length : null

  let recommendation =
    "Track every application outcome. After ten applications, this will stop guessing and start changing the board order from your real conversion data."
  if (applied.length >= 10 && strongest) {
    recommendation = `Double down on ${strongest.label.toLowerCase()}: ${Math.round(strongest.replyRate * 100)}% reply rate beats your baseline by ${Math.round(strongest.lift * 100)} points.`
  } else if (applied.length >= 10 && weakest) {
    recommendation = `Stop spending first-pass energy on ${weakest.label.toLowerCase()}: ${Math.round(weakest.replyRate * 100)}% reply rate is below your baseline.`
  } else if (applied.length > 0) {
    recommendation = `${applied.length} tracked application${applied.length === 1 ? "" : "s"} so far. Keep logging replies, rejections and interviews; the app needs about ten to learn your pattern.`
  }

  return {
    applied: applied.length,
    replyRate,
    interviewRate,
    strongestSignal: strongest?.label ?? "Not enough outcome data yet",
    warningSignal: weakest?.label ?? "No weak segment proven yet",
    recommendation,
    segments,
  }
}

export function worthYourHour(
  job: Job,
  applications: Application[],
  contacts: Contact[],
  jobs: Job[],
  resumeScore: number | null = null,
  portfolioReady = false,
): WorthScore {
  const learning = learnOutcomes(applications, jobs)
  const relatedContacts = contacts.filter((c) => c.company.toLowerCase() === job.company.toLowerCase())
  const fit = clamp(Math.round(job.match_score * 0.28), 0, 28)
  const age = ageTone(job)
  const freshness = age === "good" ? 18 : age === "neutral" ? 13 : age === "warn" ? 7 : 0
  const pay = job.salary_parsed ? (job.salary_parsed.inr_high >= 8_000_000 ? 12 : 8) : 5
  const human = relatedContacts.length ? 14 : job.linkedin.searches.length ? 9 : 2
  const resume = resumeScore === null ? 7 : resumeScore >= 75 ? 14 : resumeScore >= 60 ? 9 : 2
  const portfolio = portfolioReady ? 8 : 3
  const segmentLift = learning.segments
    .filter((segment) => bucket(job).some((b) => b.key === segment.key))
    .sort((a, b) => b.lift - a.lift)[0]?.lift ?? 0
  const outcome = learning.applied >= 10 ? clamp(Math.round(segmentLift * 100), -10, 10) : 0
  const score = clamp(fit + freshness + pay + human + resume + portfolio + outcome)

  const signals: WorthSignal[] = [
    {
      label: "Fit",
      value: `${job.match_score}/100`,
      detail: job.match_reasons[0] ?? "Profile and posting overlap.",
      points: fit,
      tone: job.match_score >= 85 ? "good" : job.match_score >= 70 ? "neutral" : "warn",
    },
    {
      label: "Freshness",
      value: age === "bad" ? "ghost risk" : age === "warn" ? "verify first" : "usable",
      detail: age === "bad" ? "Too old to tailor cold." : age === "warn" ? "Reach a human before spending the hour." : "Inside the useful application window.",
      points: freshness,
      tone: age === "bad" ? "bad" : age === "warn" ? "warn" : "good",
    },
    {
      label: "Human path",
      value: relatedContacts.length ? `${relatedContacts.length} saved` : job.linkedin.searches.length ? "search ready" : "cold",
      detail: relatedContacts[0]?.name ?? job.linkedin.searches[0]?.label ?? "No recruiter, referral or design lead path is ready.",
      points: human,
      tone: relatedContacts.length ? "good" : job.linkedin.searches.length ? "warn" : "bad",
    },
    {
      label: "ATS",
      value: resumeScore === null ? "resume needed" : `${resumeScore}/100`,
      detail: resumeScore === null ? "Paste a resume once to unlock Jobscan-style matching." : resumeScore >= 75 ? "Strong enough to send after proofreading." : "Tailor the first third before applying.",
      points: resume,
      tone: resumeScore === null ? "warn" : resumeScore >= 75 ? "good" : resumeScore >= 60 ? "warn" : "bad",
    },
    {
      label: "Learning",
      value: learning.applied >= 10 ? `${outcome >= 0 ? "+" : ""}${outcome}` : "warming up",
      detail: learning.applied >= 10 ? `Your past outcomes move this role by ${outcome} points.` : "Outcome learning activates after about ten tracked applications.",
      points: outcome,
      tone: outcome > 3 ? "good" : outcome < -3 ? "warn" : "neutral",
    },
  ]

  const label = score >= 78 ? "Apply properly" : score >= 62 ? "Worth it with one fix" : score >= 45 ? "Only if strategic" : "Do not spend the hour"
  const verdict =
    score >= 78
      ? "This is the kind of role to tailor, contact a human for, and track tightly."
      : score >= 62
        ? "Good enough to work, but fix the weakest signal before opening the posting."
        : score >= 45
          ? "Shortlist it or send a human probe first; do not do a full application cold."
          : "The hour is better spent on a higher-fit, fresher or more reachable role."

  return { score, label, verdict, signals, outcomeLift: outcome }
}

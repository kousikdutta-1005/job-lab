/**
 * What to do today, in the order it is worth doing.
 *
 * A job board hands you a list and leaves the judgement to you. The judgement
 * is the hard part: which of two hundred roles is worth an hour, whether the
 * application you sent nine days ago is dead, whether the one line missing from
 * your resume is costing you more than the next twenty applications would gain.
 *
 * Everything here is computed in the browser from data already on the page, and
 * every item states the evidence behind it. Nothing is invented, and an empty
 * queue is a legitimate answer.
 */

import type { Application, Contact, Job, Settings } from "./types"
import { matchResume } from "./resume"
import { daysAgo } from "./format"

export type ActionKind =
  | "offer"
  | "interview"
  | "apply"
  | "follow_up"
  | "expiring"
  | "resume"
  | "profile"
  | "network"
  | "nothing"

export interface Action {
  id: string
  kind: ActionKind
  urgency: number
  title: string
  detail: string
  evidence?: string
  jobId?: string
  view?: "board" | "tracker" | "contacts" | "settings" | "pay" | "negotiate"
}

/**
 * An open offer outranks everything else on this page and it is not close.
 * A week of applying might move your odds a few percent; an hour on a counter
 * moves the number itself, permanently, and compounds into every later offer.
 */
function liveOffers(applications: Application[]): Action[] {
  return applications
    .filter((row) => row.stage === "offer")
    .map((row) => {
      const figure = row.salary_min ? ` at ${Math.round(row.salary_min / 100000)}L` : ""
      const dated = row.activities.find((a) => a.type === "offer")?.date
      const age = dated ? daysAgo(dated) : null
      return {
        id: `offer-${row.id}`,
        kind: "offer" as const,
        urgency: 100,
        title: `Answer the ${row.company} offer${figure}`,
        detail: row.salary_min
          ? "Read it against the published band before you reply. Almost every offer has room, and the only cost of asking once, well, is the discomfort of asking."
          : "No figure saved against this yet. Put the number in the tracker so it can be read against the published band.",
        evidence:
          age !== null
            ? `${row.title} · offer logged ${age === 0 ? "today" : `${age} days ago`}`
            : row.title,
        view: "negotiate" as const,
      }
    })
}

/** Something is booked or in flight; preparation beats another application. */
function interviewing(applications: Application[]): Action[] {
  return applications
    .filter((row) => row.stage === "phone_screen" || row.stage === "interview")
    .slice(0, 3)
    .map((row) => ({
      id: `prep-${row.id}`,
      kind: "interview" as const,
      urgency: row.stage === "interview" ? 98 : 96,
      title: `Prepare for ${row.company}`,
      detail:
        row.stage === "interview"
          ? "You are past the screen. This is the stage where preparation shows most: have the two case studies chosen, and the numbers in them ready."
          : "A screen is a filter, not a conversation. Know the salary you will say out loud before they ask.",
      evidence: row.title,
      jobId: row.job_id ?? undefined,
      view: row.job_id ? ("board" as const) : ("tracker" as const),
    }))
}

/** Applied a week or more ago, nothing since, still worth one polite chase. */
function followUps(applications: Application[]): Action[] {
  return applications
    .filter((row) => {
      if (row.stage !== "applied" || !row.date_applied) return false
      const age = daysAgo(row.date_applied) ?? 0
      const chased = row.activities.some((a) => a.type === "email_sent")
      return age >= 7 && age <= 45 && !chased
    })
    .map((row) => {
      const age = daysAgo(row.date_applied) ?? 0
      return {
        id: `follow-${row.id}`,
        kind: "follow_up" as const,
        // Chasing is cheap and low-stakes. It should sit under anything that
        // is actually in play — an offer, an interview, or the one resume edit
        // that lifts a dozen applications at once.
        urgency: 78 + Math.min(8, age - 7),
        title: `Follow up with ${row.company}`,
        detail: `You applied ${age} days ago and have not chased it. One follow-up is expected and often the thing that surfaces an application; a second is not.`,
        evidence: row.title,
        view: "tracker" as const,
      }
    })
}

/** Strong matches you have not touched, best first. */
function worthApplying(jobs: Job[], applications: Application[]): Action[] {
  const touched = new Set(applications.map((a) => a.job_id).filter(Boolean) as string[])
  return jobs
    .filter((job) => job.eligible && job.match_score >= 70 && !touched.has(job.id))
    .slice(0, 5)
    .map((job, index) => ({
      id: `apply-${job.id}`,
      kind: "apply" as const,
      urgency: 70 - index,
      title: `Apply to ${job.title} at ${job.company}`,
      detail: job.match_reasons.slice(0, 2).join(". ") + ".",
      evidence: `Scores ${job.match_score} · ${job.cities[0] ?? job.location_raw ?? "remote"}`,
      jobId: job.id,
      view: "board" as const,
    }))
}

/** Good roles going cold. Design roles are usually shortlisted within a month. */
function expiring(jobs: Job[], applications: Application[]): Action[] {
  const touched = new Set(applications.map((a) => a.job_id).filter(Boolean) as string[])
  return jobs
    .filter((job) => {
      if (!job.eligible || touched.has(job.id) || job.match_score < 62) return false
      const age = daysAgo(job.posted_at)
      return age !== null && age >= 21 && age <= 45
    })
    .slice(0, 3)
    .map((job) => ({
      id: `expiring-${job.id}`,
      kind: "expiring" as const,
      urgency: 80,
      title: `${job.title} at ${job.company} is going cold`,
      detail: `Posted ${daysAgo(job.posted_at)} days ago and still open, but most design shortlists are drawn inside a month. Apply now or let it go deliberately.`,
      evidence: `Scores ${job.match_score}`,
      jobId: job.id,
      view: "board" as const,
    }))
}

/**
 * The highest-leverage edit to your resume.
 *
 * Rather than scoring one job at a time, this asks which single missing term
 * appears across the most of your best matches. Adding one line can lift a
 * dozen applications at once, which is worth more than sending a dozen more.
 */
function resumeLeverage(
  jobs: Job[],
  settings: Settings,
  idf: Record<string, number>,
): Action[] {
  if (!settings.resume_text) {
    return [
      {
        id: "resume-missing",
        kind: "profile",
        urgency: 95,
        title: "Add your resume once",
        detail:
          "Every role on the board gets scored against it, and the gaps get ranked by how rare each requirement is. It stays in this browser and is never uploaded.",
        view: "settings",
      },
    ]
  }

  const top = jobs.filter((j) => j.eligible).slice(0, 25)
  if (top.length < 4) return []

  const missingCounts = new Map<string, { jobs: number; idf: number }>()
  for (const job of top) {
    const result = matchResume(settings.resume_text, job, idf)
    for (const gap of result.missing.slice(0, 12)) {
      const current = missingCounts.get(gap.term) ?? { jobs: 0, idf: gap.idf }
      current.jobs += 1
      missingCounts.set(gap.term, current)
    }
  }

  const ranked = Array.from(missingCounts.entries())
    .map(([term, stats]) => ({ term, ...stats, leverage: stats.jobs * stats.idf }))
    .sort((a, b) => b.leverage - a.leverage)
    .slice(0, 3)
    .filter((row) => row.jobs >= Math.max(3, Math.round(top.length * 0.25)))

  if (ranked.length === 0) return []

  // Three near-identical cards saying "your resume never mentions X" is three
  // times the space for one decision. It is one editing session, so it is one card.
  const quoted = ranked.map((r) => `“${r.term}”`)
  const phrase =
    quoted.length === 1
      ? quoted[0]
      : `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`
  const reach = Math.max(...ranked.map((r) => r.jobs))

  return [
    {
      id: `resume-${ranked.map((r) => r.term).join("-")}`,
      kind: "resume" as const,
      urgency: 85,
      title:
        ranked.length === 1
          ? `Your resume never mentions ${phrase}`
          : `Your resume never mentions ${phrase}`,
      detail: `${ranked
        .map((r) => `${r.term} — ${r.jobs}`)
        .join(", ")} of your ${top.length} best matches ask for these. One editing session lifts up to ${reach} applications at once, which beats sending ${reach} more.`,
      evidence: `Ranked by how many roles ask × how rare the term is (${ranked
        .map((r) => `${r.term} ${r.idf.toFixed(2)}`)
        .join(", ")})`,
      view: "settings" as const,
    },
  ]
}

/** Things that are switched off until you fill in a field. */
function profileGaps(settings: Settings): Action[] {
  const out: Action[] = []
  if (!settings.full_name || !settings.email || !settings.phone || !settings.portfolio) {
    const missing = [
      !settings.full_name && "name",
      !settings.email && "email",
      !settings.phone && "phone",
      !settings.portfolio && "portfolio URL",
    ].filter(Boolean)
    out.push({
      id: "profile-incomplete",
      kind: "profile",
      urgency: 92,
      title: `Fill in your ${missing.join(", ")}`,
      detail:
        "The autofill bookmarklet and every outreach draft are built from these. Until they are set, both are working with blanks.",
      view: "settings",
    })
  }
  if (!settings.current_ctc) {
    out.push({
      id: "profile-ctc",
      kind: "profile",
      urgency: 40,
      title: "Add your current salary",
      detail:
        "It never leaves this browser, and it is the only way Pay can tell you where you sit against the published bands rather than just showing you the bands.",
      view: "pay",
    })
  }
  return out
}

/** Companies you are in a process with, where you know nobody. */
function networkGaps(applications: Application[], contacts: Contact[]): Action[] {
  const known = new Set(contacts.map((c) => c.company.toLowerCase()))
  const live = applications.filter((a) =>
    ["applied", "phone_screen", "interview"].includes(a.stage),
  )
  return live
    .filter((a) => !known.has(a.company.toLowerCase()))
    .slice(0, 3)
    .map((a) => ({
      id: `network-${a.id}`,
      kind: "network" as const,
      urgency: 60,
      title: `You know nobody at ${a.company}`,
      detail:
        "You have a live application there and no route to a human. Open the role, use the LinkedIn searches to find the design lead, and save them to Contacts.",
      evidence: a.title,
      jobId: a.job_id ?? undefined,
      view: "board" as const,
    }))
}

export function briefing(
  jobs: Job[],
  applications: Application[],
  contacts: Contact[],
  settings: Settings,
  idf: Record<string, number>,
): Action[] {
  const actions = [
    ...liveOffers(applications),
    ...interviewing(applications),
    ...profileGaps(settings),
    ...followUps(applications),
    ...resumeLeverage(jobs, settings, idf),
    ...expiring(jobs, applications),
    ...worthApplying(jobs, applications),
    ...networkGaps(applications, contacts),
  ]

  actions.sort((a, b) => b.urgency - a.urgency)

  if (actions.length === 0) {
    return [
      {
        id: "nothing",
        kind: "nothing",
        urgency: 0,
        title: "Nothing needs you today",
        detail:
          "Every strong match is either applied to or deliberately skipped, and nothing is waiting on a follow-up. The crawl runs again tonight.",
      },
    ]
  }

  return actions.slice(0, 12)
}

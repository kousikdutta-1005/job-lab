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
import { funnel } from "./funnel"
import { audit, criteria, type Project } from "./portfolio"
import { vet } from "./vetting"

export type ActionKind =
  | "offer"
  | "portfolio"
  | "funnel"
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
  view?: "board" | "tracker" | "contacts" | "settings" | "pay" | "negotiate" | "portfolio"
}

/**
 * The two halves of the tool talking to each other.
 *
 * The funnel knows which step is leaking. The portfolio audit knows what your
 * case studies do not show. Separately they are two dashboards; together they
 * answer the actual question, which is what to do with the next hour.
 */
function diagnosis(
  applications: Application[],
  projects: Project[],
  jobs: Job[],
): Action[] {
  const out: Action[] = []
  const shape = funnel(applications)

  if (shape.weakest && shape.enough) {
    out.push({
      id: `funnel-${shape.weakest.key}`,
      kind: "funnel",
      urgency: 88,
      title:
        shape.weakest.key === "replied"
          ? "Sending more applications will not fix this"
          : shape.weakest.key === "interview"
            ? "You are getting in the room and not getting past it"
            : "The top of your funnel is working — stop tuning it",
      detail: shape.verdict,
      evidence: `Measured across ${shape.steps[0].count} applications you have tracked`,
      view: "tracker",
    })
  }

  if (projects.length === 0) {
    // Only worth raising once there is evidence the portfolio is the bottleneck,
    // or you have applied enough that it is about to become one.
    const applied = applications.filter((a) => a.date_applied).length
    if (applied >= 5) {
      out.push({
        id: "portfolio-empty",
        kind: "portfolio",
        urgency: 64,
        title: "Your case studies have never been checked against the board",
        detail:
          "Everything else here optimises the resume, which gets six seconds. The portfolio gets the decision. Adding the three you actually send takes five minutes and tells you which one is carrying the others.",
        view: "portfolio",
      })
    }
    return out
  }

  const list = criteria(jobs)
  const result = audit(projects, list)
  const worst = result.gaps.find((g) => g.covered === 0)

  if (worst) {
    const interviewing = applications.filter((a) =>
      ["interview", "offer", "accepted"].includes(a.stage),
    ).length
    const converted = applications.filter((a) => ["offer", "accepted"].includes(a.stage)).length
    const stuckAtPortfolio = interviewing >= 3 && converted === 0

    out.push({
      id: `portfolio-${worst.criterion.key}`,
      kind: "portfolio",
      // If interviews are not converting, this stops being housekeeping.
      urgency: stuckAtPortfolio ? 93 : 66,
      title: `No case study of yours shows ${worst.criterion.label.toLowerCase()}`,
      detail: stuckAtPortfolio
        ? `${interviewing} interviews and no offer, and this is the one thing ${worst.criterion.demandCount} of your eligible roles ask about that none of your work demonstrates. That is the likeliest thing being asked in the room that you have no answer to.`
        : `${worst.criterion.demandCount} of the roles you can take ask about it. ${worst.criterion.asks} Usually this is a rewrite of a case study you already have rather than new work.`,
      evidence: `Asked for in ${Math.round(worst.criterion.demand * 100)}% of eligible postings`,
      view: "portfolio",
    })
  }

  return out
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

/**
 * Strong matches you have not touched, best first.
 *
 * Anything the vetting card is suspicious of is left out. The queue used to
 * name Hackerrank in a "past the month mark, check it is live" card and then
 * say "Apply to Hackerrank" two rows below it, which is the app arguing with
 * itself in the space of one screen.
 */
function worthApplying(jobs: Job[], applications: Application[]): Action[] {
  const touched = new Set(applications.map((a) => a.job_id).filter(Boolean) as string[])
  return jobs
    .filter((job) => job.eligible && job.match_score >= 70 && !touched.has(job.id))
    .filter((job) => {
      const tone = vet(job).tone
      return tone !== "warn" && tone !== "bad"
    })
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

/**
 * Roles worth deciding about now, either because the window is closing or
 * because it has closed and the posting may not be real.
 *
 * This used to say "apply now or let it go" about anything 21–45 days old,
 * which contradicted the job page: the vetting card calls a 42-day posting a
 * warning and tells you to check it is live before spending an hour on it.
 * Two surfaces giving opposite advice about the same job is worse than either
 * being wrong on its own, so both now read from vet().
 */
function expiring(jobs: Job[], applications: Application[]): Action[] {
  const touched = new Set(applications.map((a) => a.job_id).filter(Boolean) as string[])
  const candidates = jobs
    .filter((job) => {
      if (!job.eligible || touched.has(job.id) || job.match_score < 62) return false
      const age = job.quality?.days_open ?? daysAgo(job.posted_at)
      return age !== null && age >= 21
    })
    .map((job) => ({ job, vetting: vet(job) }))

  const closing = candidates.filter((c) => c.vetting.tone === "warn")
  const suspect = candidates.filter((c) => c.vetting.tone === "bad")

  const out: Action[] = []

  // Collapsed into one card. Three consecutive near-identical rows reading
  // "X is going cold" is the fastest way to teach someone to skim past the
  // queue, and the queue only works if every row is worth reading.
  if (closing.length) {
    const [first, ...rest] = closing
    const age = first.job.quality?.days_open ?? daysAgo(first.job.posted_at) ?? 0
    out.push({
      id: `expiring-${first.job.id}`,
      kind: "expiring",
      urgency: 80,
      title: rest.length
        ? `${rest.length + 1} strong roles are past the month mark`
        : `${first.job.title} at ${first.job.company} is past the month mark`,
      detail: rest.length
        ? `${[first, ...rest]
            .slice(0, 4)
            .map((c) => `${c.job.company} (${c.job.quality?.days_open ?? daysAgo(c.job.posted_at)}d)`)
            .join(", ")}. Design shortlists are usually drawn inside a month, so these are either hard to fill — which is leverage — or being kept warm. One line to the recruiter asking where they are in the process costs a minute and decides all of them.`
        : `Open ${age} days. Past the month where shortlists usually close, so ask whether it is still live before you spend an hour tailoring for it.`,
      evidence: `Scores ${first.job.match_score}`,
      jobId: first.job.id,
      view: "board",
    })
  }

  if (suspect.length) {
    const [first, ...rest] = suspect
    out.push({
      id: `ghost-${first.job.id}`,
      kind: "expiring",
      urgency: 44,
      title: rest.length
        ? `${rest.length + 1} roles look like they may not be real`
        : `${first.job.title} at ${first.job.company} may not be real`,
      detail: `${[first, ...rest]
        .slice(0, 4)
        .map((c) => `${c.job.company} (${Math.round((c.job.quality?.days_open ?? 0) / 30)}mo)`)
        .join(", ")}. Around a fifth of listings are ghosts, and age is the strongest signal available from outside. Do not tailor for these. Send two lines to someone on the team and let the silence answer it.`,
      evidence: `Scores ${first.job.match_score}`,
      jobId: first.job.id,
      view: "board",
    })
  }

  return out
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

/** Companies you are in a process with, where you know nobody. */function networkGaps(applications: Application[], contacts: Contact[]): Action[] {
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
  projects: Project[] = [],
): Action[] {
  const actions = [
    ...liveOffers(applications),
    ...diagnosis(applications, projects, jobs),
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

import type { Application, Job, Settings } from "./types"
import type { MatchResult } from "./resume"
import { ageTone } from "./vetting"

export interface BurnoutPlan {
  mode: "protect" | "focus" | "push"
  quota: number
  headline: string
  detail: string
  moves: string[]
}

export interface ChecklistItem {
  label: string
  detail: string
  ready: boolean
}

export interface BlackHoleRead {
  headline: string
  detail: string
  tone: "good" | "warn" | "bad" | "neutral"
}

export interface StoryPrompt {
  question: string
  story: string
  proof: string
}

const ACTIVE = new Set(["applied", "phone_screen", "interview", "offer"])

function daysSince(date?: string): number | null {
  if (!date) return null
  const time = Date.parse(date)
  if (!Number.isFinite(time)) return null
  return Math.floor((Date.now() - time) / 86_400_000)
}

export function burnoutPlan(applications: Application[], readyRoles: number): BurnoutPlan {
  const live = applications.filter((row) => ACTIVE.has(row.stage)).length
  const interviews = applications.filter((row) => row.stage === "phone_screen" || row.stage === "interview").length
  const stale = applications.filter((row) => {
    if (row.stage !== "applied") return false
    const age = daysSince(row.date_applied)
    return age !== null && age >= 7 && !row.activities.some((a) => a.type === "email_sent")
  }).length

  if (interviews > 0 || stale >= 3 || live >= 12) {
    return {
      mode: "protect",
      quota: Math.max(0, Math.min(1, readyRoles)),
      headline: "Protect attention; do not spray applications today",
      detail:
        "Target users complain about burnout and black-hole guessing. When interviews, follow-ups or a crowded pipeline exist, the highest-leverage move is to close loops before adding more.",
      moves: [
        "Prep every booked conversation before applying anywhere else.",
        "Send one follow-up to each seven-day silent application.",
        "Apply only to one unusually strong role if the packet is ready.",
      ],
    }
  }

  if (readyRoles >= 4 && live < 8) {
    return {
      mode: "push",
      quota: 3,
      headline: "Three quality applications is the ceiling",
      detail:
        "Reddit and LinkedIn pain is not 'I need to click apply faster'; it is 'I need better odds without losing my mind'. Three complete packets beats twenty generic submits.",
      moves: [
        "Pick the top three Worth-your-hour roles.",
        "For each: tailor resume, pick portfolio proof, find one human, then apply.",
        "Stop after three even if the board has more.",
      ],
    }
  }

  return {
    mode: "focus",
    quota: Math.min(2, readyRoles),
    headline: "Work the best one or two roles deeply",
    detail:
      "The market is flooded with AI-generated applications. The edge is a smaller number of applications that look unmistakably human.",
    moves: [
      "Choose the role with the clearest human path.",
      "Update LinkedIn/portfolio proof before outreach.",
      "Log the outcome so the board learns what works.",
    ],
  }
}

export function linkedinBridge(job: Job, settings: Settings, match: MatchResult | null): ChecklistItem[] {
  const topTerms = job.keywords.slice(0, 4)
  const hasLinkedIn = Boolean(settings.linkedin.trim())
  const hasPortfolio = Boolean(settings.portfolio.trim())
  return [
    {
      label: "Profile URL ready",
      detail: hasLinkedIn
        ? "LinkedIn can be included in ATS forms and outreach."
        : "Add your LinkedIn URL once in Settings so every ATS and email can include it.",
      ready: hasLinkedIn,
    },
    {
      label: "Headline mirrors the market",
      detail: `Your headline/about should make ${job.seniority_label.toLowerCase()} ${job.title.toLowerCase()} feel obvious, not implied.`,
      ready: Boolean(match && match.titleScore >= 70),
    },
    {
      label: "Featured proof matches the JD",
      detail: hasPortfolio
        ? `Feature the case study that proves ${topTerms.slice(0, 2).join(" + ") || "the core requirement"}.`
        : "Add your portfolio URL; recruiters check LinkedIn and portfolio consistency before replying.",
      ready: hasPortfolio,
    },
    {
      label: "Skills echo the posting",
      detail: topTerms.length
        ? `Make sure these appear honestly in Skills/About: ${topTerms.join(", ")}.`
        : "Make the first screen explain what kind of design work you do.",
      ready: Boolean(match && match.weightedCoverage >= 0.65),
    },
  ]
}

export function blackHoleRead(row: Application, job?: Job | null): BlackHoleRead {
  const quiet = daysSince(row.activities[0]?.date ?? row.date_applied ?? row.date_saved)

  if (row.stage === "rejected") {
    return {
      tone: "neutral",
      headline: "Not a black hole — this one answered",
      detail:
        "A rejection is still signal. Tag what kind of role it was, then let outcome learning decide whether to reduce that segment.",
    }
  }

  if (row.stage === "phone_screen" || row.stage === "interview" || row.stage === "offer") {
    return {
      tone: "good",
      headline: "The top of this funnel worked",
      detail: "Do not keep optimizing the application. Prepare the story, portfolio walkthrough and compensation answer.",
    }
  }

  if (!row.date_applied) {
    return {
      tone: "neutral",
      headline: "Saved, not in the black hole yet",
      detail: "Before applying, build the packet: ATS fit, portfolio proof, human path and follow-up date.",
    }
  }

  if (quiet !== null && quiet >= 21) {
    return {
      tone: "bad",
      headline: "Probably silent unless a human revives it",
      detail:
        "Past three weeks with no movement. Do not keep refreshing the tracker; send one human note if the role is still worth it, then archive.",
    }
  }

  if (quiet !== null && quiet >= 7) {
    return {
      tone: "warn",
      headline: "One follow-up is justified",
      detail:
        "This is the exact black-hole moment job seekers complain about. A short chaser is reasonable; more applications are not a substitute.",
    }
  }

  if (job && ageTone(job) === "bad") {
    return {
      tone: "warn",
      headline: "The posting itself had ghost-job risk",
      detail: "If this stays silent, treat the listing age as the lesson rather than blaming your resume.",
    }
  }

  return {
    tone: "neutral",
    headline: "Too early to diagnose",
    detail: "Log replies, rejections and interviews. Without outcome data every tool is guessing.",
  }
}

export function interviewStoryBank(job: Job, match: MatchResult | null): StoryPrompt[] {
  const themes = job.keywords.slice(0, 4)
  const gap = match?.missing.find((item) => !item.claimed)?.term
  return [
    {
      question: "Walk me through a project with business impact.",
      story: `Use a case study where the metric changed, not just the screen. Tie it to ${themes[0] ?? "the main job theme"}.`,
      proof: "Have before/after metric, decision you made, tradeoff, and what shipped.",
    },
    {
      question: "How do you work with PMs and engineers?",
      story: `Pick a moment where collaboration changed the design direction for ${themes[1] ?? "a product constraint"}.`,
      proof: "Name the conflict, your artifact, and how the team decided.",
    },
    {
      question: "Why are you strong for this role specifically?",
      story: `Answer with the overlap between your work and ${themes.slice(0, 3).join(", ") || job.title}.`,
      proof: "Use the same terms as the posting, but only where your portfolio proves them.",
    },
    {
      question: gap ? `Tell me about ${gap}.` : "What would you need to learn here?",
      story: gap
        ? `Do not fake ${gap}. If you have adjacent proof, frame it honestly; otherwise say how you would close it.`
        : "Use the strongest missing area as a learning plan, not a weakness monologue.",
      proof: "One adjacent example plus a concrete ramp plan beats pretending.",
    },
  ]
}

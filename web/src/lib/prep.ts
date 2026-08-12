/**
 * Preparing for the conversation, built from the posting rather than a listicle.
 *
 * Generic interview advice is worthless because it is generic. What is useful
 * is knowing which two or three things *this* company will actually probe, and
 * that is derivable: a posting that repeatedly names design systems will ask
 * about governance, and one that names research will ask how you decide what to
 * build. The rare terms in a posting are its real agenda.
 *
 * The portfolio structure below is the one design interviews actually use, and
 * the questions are the ones that recur. Nothing here pretends to know the
 * company's internal process — where it does not know, it says so.
 */

import type { Job } from "./types"

export interface PrepSection {
  heading: string
  items: string[]
  note?: string
}

/** The terms this posting leans on that most postings do not. */
export function agenda(job: Job, idf: Record<string, number>, count = 5): string[] {
  return Array.from(new Set(job.keywords))
    .map((term) => ({ term, weight: idf[term] ?? 1 }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, count)
    .map((row) => row.term)
}

const BY_GROUP: Record<string, string[]> = {
  systems: [
    "How did you decide what belonged in the system and what stayed local to a product?",
    "Who owned the system, and how did you get other teams to adopt it rather than fork it?",
    "What did you get wrong in a component API, and what did it cost to change later?",
  ],
  research: [
    "Tell me about a time research changed the direction of a project, not just confirmed it.",
    "How do you decide when you have enough evidence to stop researching and start building?",
    "What is a finding you were confident about that turned out to be wrong?",
  ],
  accessibility: [
    "Walk me through how you would make this flow work for a screen reader user.",
    "Where have you had to argue for accessibility against a deadline, and how did that go?",
  ],
  technical: [
    "How far into the implementation do you usually go, and where do you hand off?",
    "Describe a time the engineering constraint changed the design, and how you handled it.",
  ],
  leadership: [
    "How do you give critique to someone more senior than you?",
    "Tell me about a designer you grew, and what specifically you did.",
    "How do you decide what your team should not work on?",
  ],
  process: [
    "Take me through a project where the process broke down. What did you change?",
    "How do you work with a product manager who has already decided the solution?",
  ],
  craft: [
    "Show me something you iterated heavily. What did the first version get wrong?",
    "How do you know when a screen is finished?",
  ],
  domain: [
    "What do you think is hard about designing in this domain specifically?",
    "Who do you think the user actually is here, and what do they want that the brief does not say?",
  ],
}

const UNIVERSAL: string[] = [
  "Why this company, in a sentence that could not apply to any other company?",
  "What is the piece of work you are proudest of, and what did it change?",
  "Tell me about a time you disagreed with a decision and lost. What did you do next?",
  "What do you want to be better at in two years?",
]

export function likelyQuestions(job: Job, limit = 9): string[] {
  const groups = Object.keys(job.keyword_groups)
  const out: string[] = []

  // Weighted by how much of the posting each theme occupies, so a systems-heavy
  // posting gets systems questions first.
  const ranked = groups
    .map((group) => ({ group, size: job.keyword_groups[group]?.length ?? 0 }))
    .sort((a, b) => b.size - a.size)

  for (const { group } of ranked) {
    for (const question of BY_GROUP[group] ?? []) {
      if (out.length < limit - 2) out.push(question)
    }
  }

  for (const question of UNIVERSAL) {
    if (out.length < limit) out.push(question)
  }

  return out
}

export function portfolioPlan(job: Job, idf: Record<string, number>): PrepSection[] {
  const themes = agenda(job, idf, 4)
  const seniorRole = ["lead", "staff", "principal", "manager", "head", "director", "executive"].includes(
    job.seniority,
  )

  return [
    {
      heading: "Pick the work before you build the deck",
      items: [
        `Choose two projects, not five. At least one should touch ${themes[0] ?? "the core problem in this posting"}, because that is what this posting keeps returning to.`,
        seniorRole
          ? "At this level one of them should be about a decision you made across teams, not a screen you drew. They are hiring judgement."
          : "One should show range and one should show depth. Depth is the one they will dig into.",
        "Have a third project loaded but unpresented, for when they ask about something the first two do not cover.",
      ],
    },
    {
      heading: "Structure each story the same way",
      items: [
        "The situation, in two sentences. Resist the company history.",
        "What made it hard — the real constraint, not the brief.",
        "What you tried that did not work. This is the part interviewers remember.",
        "What you shipped, and what changed because of it. A number if you have one, an honest 'we never measured it' if you do not.",
        "What you would do differently now.",
      ],
      note: "Most portfolio reviews fail on the third point. Candidates present a straight line from brief to solution, which no real project has ever been.",
    },
    {
      heading: "Prepare for the obvious follow-ups",
      items: [
        "For every screen: why this and not the obvious alternative?",
        "For every decision: whose call was it, and who disagreed?",
        "For every metric: how was it measured, and what else moved?",
        themes.length > 1
          ? `Expect a specific probe on ${themes.slice(0, 3).join(", ")} — those are the terms this posting uses that most postings do not.`
          : "Expect one probe on the rarest requirement in the posting.",
      ],
    },
    {
      heading: "Questions worth asking them",
      items: [
        "What does the design team disagree about right now?",
        "Who was the last designer to leave, and why?",
        "How does a design decision get overturned here, and by whom?",
        "What would my first ninety days look like if it went well? And if it went badly?",
        job.years_min
          ? `The posting asks for ${job.years_min}+ years — ask what the last person at this level was doing after a year, to find out whether the level is real.`
          : "Ask what level this role sits at internally, and what the level above it looks like.",
      ],
    },
  ]
}

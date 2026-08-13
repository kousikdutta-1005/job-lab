/**
 * The portfolio is the application.
 *
 * Every other tool in this category optimises the resume, because a resume is
 * text and text is easy to score. For a design role the resume gets six seconds
 * and the portfolio gets the decision, and nobody builds anything to check the
 * portfolio against what the roles are actually asking for.
 *
 * So: a small set of criteria, each one tied to real terms in real postings, so
 * the weight on a criterion is measured from the board rather than asserted.
 * You self-assess each project against them — honestly, because nobody else is
 * reading this — and the gaps get ranked by how many of your target roles ask.
 */

import { hasTerm } from "./resume"
import type { Job } from "./types"

export interface Criterion {
  key: string
  label: string
  /** What a reviewer is looking for. Written as the question they ask. */
  asks: string
  /** Terms in a posting that indicate this is being assessed. */
  terms: string[]
  /** Fraction of eligible roles whose text asks for it. Measured, not assumed. */
  demand: number
  demandCount: number
}

export interface Project {
  id: string
  name: string
  url: string
  /** criterion key -> met */
  met: Record<string, boolean>
  notes?: string
}

const CRITERIA: Array<Omit<Criterion, "demand" | "demandCount">> = [
  {
    key: "outcome",
    label: "A number at the end",
    asks: "Did anything change because of this work, and can you say by how much?",
    terms: ["analytics", "metrics", "impact", "conversion", "experimentation", "a/b", "growth"],
  },
  {
    key: "research",
    label: "Evidence you talked to someone",
    asks: "Is there a decision in here that came from a user rather than from you?",
    terms: ["user research", "discovery", "usability testing", "synthesis", "interviews", "research"],
  },
  {
    key: "systems",
    label: "Systems thinking",
    asks: "Does it show a pattern that held up across screens, not one beautiful screen?",
    terms: ["design system", "governance", "documentation", "component", "tokens", "systems"],
  },
  {
    key: "craft",
    label: "Visible craft",
    asks: "Would a designer look at the typography and layout and think this person can see?",
    terms: ["visual design", "typography", "layout", "craft", "interaction design", "motion"],
  },
  {
    key: "engineering",
    label: "Worked with engineers",
    asks: "Is there evidence you shipped it, not just designed it?",
    terms: ["frontend", "react", "html", "css", "prototyping", "developer", "handoff", "typescript"],
  },
  {
    key: "accessibility",
    label: "Accessibility considered",
    asks: "Did anyone who cannot see the screen get thought about?",
    terms: ["accessibility", "wcag", "a11y", "inclusive", "screen reader", "contrast"],
  },
  {
    key: "ambiguity",
    label: "Started from nothing",
    asks: "Did you define the problem, or were you handed it?",
    terms: ["ambiguity", "strategy", "vision", "definition", "roadmap", "discovery", "0 to 1", "zero to one"],
  },
  {
    key: "leadership",
    label: "Moved other people",
    asks: "Is there a moment where you changed what the team believed?",
    terms: ["influence", "leadership", "mentoring", "critique", "stakeholder", "coaching", "design leadership"],
  },
  {
    key: "ai",
    label: "Designed with or for AI",
    // "Fastest-growing" was a claim about change over time, and this app holds
    // two nights of history. It also read as a boast while the criterion sat
    // fourth. Describe the ask; the percentage beside it already ranks it.
    asks: "Have you shipped anything with a model behind it, rather than a concept deck?",
    terms: ["ai", "generative ai", "agentic", "llm", "machine learning", "copilot"],
  },
  {
    key: "domain",
    label: "Complexity, not just consumer polish",
    asks: "Enterprise, B2B, developer tools, fintech — work where the domain itself was hard.",
    terms: ["enterprise", "b2b", "saas", "platform", "developer tools", "fintech", "infrastructure"],
  },
]

/**
 * Weight each criterion by how many roles you could actually take mention it.
 * A criterion nobody is asking for should not sit at the top of a to-do list
 * just because it sounds virtuous.
 */
export function criteria(jobs: Job[]): Criterion[] {
  const pool = jobs.filter((j) => j.eligible)
  const base = pool.length || jobs.length
  const corpus = (pool.length ? pool : jobs).map((j) =>
    `${j.title} ${j.description_text} ${(j.keywords ?? []).join(" ")}`.toLowerCase(),
  )

  return CRITERIA.map((c) => {
    let hits = 0
    for (const text of corpus) {
      // hasTerm, not includes. "ai" as a substring is inside detail, email,
      // available and Chennai, which put this criterion at 95% of the board
      // and at the top of the to-do list. The true figure is 66%, which puts
      // "a number at the end" first instead — a different career instruction
      // built from the same data.
      if (c.terms.some((term) => hasTerm(text, term))) hits += 1
    }
    return { ...c, demand: base ? hits / base : 0, demandCount: hits }
  }).sort((a, b) => b.demand - a.demand)
}

export interface Gap {
  criterion: Criterion
  /** How many of your projects show it. */
  covered: number
  /** demand × how badly it is uncovered — what to fix first. */
  cost: number
}

export interface Audit {
  gaps: Gap[]
  strongest: Project | null
  /** 0-1, weighted by demand rather than a flat count. */
  coverage: number
  verdict: string
}

export function audit(projects: Project[], list: Criterion[]): Audit {
  if (projects.length === 0) {
    return {
      gaps: [],
      strongest: null,
      coverage: 0,
      verdict:
        "Add the case studies you actually send people. Three is usually the right number — it is what fits in a portfolio review, and the third one is the one nobody prepares.",
    }
  }

  const gaps: Gap[] = list.map((criterion) => {
    const covered = projects.filter((p) => p.met[criterion.key]).length
    // One project showing a thing is enough to talk about it; zero is the cliff.
    const shortfall = covered === 0 ? 1 : covered === 1 ? 0.4 : 0
    return { criterion, covered, cost: criterion.demand * shortfall }
  })

  const weighted = list.reduce((sum, c) => sum + c.demand, 0)
  const met = gaps.reduce((sum, g) => sum + (g.covered > 0 ? g.criterion.demand : 0), 0)
  const coverage = weighted ? met / weighted : 0

  const strongest =
    projects
      .slice()
      .sort(
        (a, b) =>
          list.reduce((s, c) => s + (b.met[c.key] ? c.demand : 0), 0) -
          list.reduce((s, c) => s + (a.met[c.key] ? c.demand : 0), 0),
      )[0] ?? null

  const missing = gaps.filter((g) => g.covered === 0).sort((a, b) => b.cost - a.cost)

  let verdict: string
  if (missing.length === 0) {
    verdict = `Every criterion the board asks for appears somewhere in your work. At that point the gap is not what you have done, it is how clearly the case studies say it — which is a writing problem, and a much better one to have.`
  } else if (missing.length === 1) {
    verdict = `One thing is missing across every project: ${missing[0].criterion.label.toLowerCase()}. ${missing[0].criterion.demandCount} of the roles you can take ask about it.`
  } else {
    const top = missing.slice(0, 2).map((m) => m.criterion.label.toLowerCase())
    verdict = `Nothing in your portfolio currently shows ${top.join(" or ")}. Those two appear in ${missing[0].criterion.demandCount} and ${missing[1].criterion.demandCount} of the roles you can take, so they are the cheapest things to fix — usually by rewriting an existing case study rather than doing new work.`
  }

  return { gaps: gaps.sort((a, b) => b.cost - a.cost || b.criterion.demand - a.criterion.demand), strongest, coverage, verdict }
}

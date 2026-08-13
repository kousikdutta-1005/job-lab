/**
 * Is this posting worth an hour of your life?
 *
 * Tailoring one application properly costs about an hour: reading the posting
 * twice, rewording the resume, finding a human, writing to them. That hour is
 * the scarce thing, and roughly a fifth of listings are ghosts — Columbia Law
 * Review put it at 21% in 2025, and Revelio Labs found the hires-per-posting
 * rate halved between 2019 and 2024. Two in five hiring managers admitted to
 * keeping a posting live with nobody to fill it.
 *
 * What this file will not do is print a confidence score out of a hundred.
 * Nothing here can see inside the company. It reports the handful of things
 * the data genuinely knows, says where each came from, and stays quiet about
 * the rest — because a made-up number about a real job is worse than silence.
 */

import type { CompanyDossier, Job } from "./types"

export type Tone = "good" | "warn" | "bad" | "neutral"

export interface Signal {
  label: string
  value: string
  note: string
  tone: Tone
  source?: string
}

export interface Vetting {
  signals: Signal[]
  headline: string
  /** Rough share of an hour worth spending, expressed as advice not a score. */
  advice: string
  tone: Tone
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/**
 * Design shortlists are usually drawn inside a month. Past that, either they
 * are struggling to fill it — which is good for you — or it was never really
 * open. Both are worth knowing before you write a bespoke letter.
 */
function age(job: Job): Signal | null {
  const quality = job.quality
  if (!quality || quality.days_open == null) return null
  const days = quality.days_open
  const stated =
    quality.days_open_basis === "ats_posted_date"
      ? "the employer's own posted date"
      : "the first day we saw it"

  if (days <= 7) {
    return {
      label: "Posted",
      value: days === 0 ? "today" : plural(days, "day") + " ago",
      note: "Fresh. Applications inside the first week are read by a human far more often than later ones, so this is the cheapest hour you will spend all day.",
      tone: "good",
      source: stated,
    }
  }
  if (days <= 30) {
    return {
      label: "Posted",
      value: plural(days, "day") + " ago",
      note: "Still inside the window where most design shortlists get drawn. Worth doing properly rather than quickly.",
      tone: "neutral",
      source: stated,
    }
  }
  if (days <= 90) {
    return {
      label: "Open",
      value: plural(days, "day"),
      note: "Past the month where shortlists usually close. Either the role is hard to fill — which is leverage — or it is being kept warm. Ask the recruiter directly whether the role is still live before you tailor anything.",
      tone: "warn",
      source: stated,
    }
  }
  return {
    label: "Open",
    value: `${Math.round(days / 30)} months`,
    note: "A posting this old is the strongest ghost-job signal available without insider data. Do not spend the hour. Send a short note to a human at the company and see whether anyone answers first.",
    tone: "bad",
    source: stated,
  }
}

/**
 * A posting written for one specific team names tools, products and numbers.
 * One written to keep a pipeline warm reads like a brochure. This is a weak
 * signal on its own and is labelled as such.
 */
function specificity(job: Job): Signal | null {
  const quality = job.quality
  if (!quality) return null
  const score = quality.description_specificity
  if (score >= 0.6) {
    return {
      label: "Written for",
      value: "a specific team",
      note: "Names real tools, products or numbers rather than describing an ideal candidate in the abstract. You can mirror that language back, and there is something concrete to ask about.",
      tone: "good",
    }
  }
  if (score >= 0.35) {
    return {
      label: "Written for",
      value: "a role, loosely",
      note: "Ordinary. Enough to tailor against, not enough to tell you much about the team.",
      tone: "neutral",
    }
  }
  return {
    label: "Written for",
    value: "nobody in particular",
    note: "Almost entirely boilerplate. That makes it hard to tailor and is mildly associated with pipeline-filling postings. Weight it lightly on its own — but with an old posting it is a real warning.",
    tone: "warn",
  }
}

/** A company posting far above its own norm is either growing or churning. */
function velocity(job: Job): Signal | null {
  const v = job.quality?.company_posting_velocity
  if (!v || v.status !== "ok" || v.ratio == null || (v.historical_median ?? 0) < 2) return null
  if (v.ratio >= 2) {
    return {
      label: "Hiring",
      value: `${v.ratio}× their usual`,
      note: `${v.current} design roles open against a usual ${v.historical_median}. A hiring push means faster decisions and a recruiter with a target to hit.`,
      tone: "good",
    }
  }
  return null
}

const FACT_LABELS: Record<string, string> = {
  founded: "Founded",
  headquarters: "Head office",
  employee_count: "Employees",
  industry: "Industry",
  parent_company: "Owned by",
  github_open_source_signal: "Open source",
}

/**
 * Company facts, each carrying the URL it came from. Nothing is inferred: if
 * Wikidata does not know when a company was founded, this says nothing rather
 * than guessing, because the whole point of the block is that every line in it
 * can be checked.
 */
export function companyFacts(dossier: CompanyDossier | null | undefined): Signal[] {
  if (!dossier?.facts) return []
  const out: Signal[] = []
  for (const [key, label] of Object.entries(FACT_LABELS)) {
    const fact = dossier.facts[key]
    if (!fact || fact.value == null || fact.value === "") continue
    let value = String(fact.value)
    if (key === "founded") {
      const year = value.slice(0, 4)
      const age = new Date().getFullYear() - Number(year)
      value = Number.isFinite(age) && age > 0 ? `${year} · ${age} years old` : year
    }
    if (key === "employee_count") value = Number(value).toLocaleString("en-IN")
    out.push({ label, value, note: "", tone: "neutral", source: fact.source })
  }
  return out
}

export function vet(job: Job, dossier?: CompanyDossier | null): Vetting {
  const ageSignal = age(job)
  const specSignal = specificity(job)
  const signals = [ageSignal, specSignal, velocity(job)].filter(
    (s): s is Signal => s !== null,
  )

  const days = job.quality?.days_open ?? null
  const ageTone = ageSignal?.tone ?? "neutral"
  const specTone = specSignal?.tone ?? "neutral"

  // Derived from the actual pair rather than from whichever signal happens to
  // be most positive. An earlier version took the best tone on the card and
  // told you a thirteen-day-old posting was "fresh", which is the small kind
  // of lie that makes someone stop trusting the rest of the page.
  let headline: string
  let advice: string
  let tone: Tone = "neutral"

  if (ageTone === "bad") {
    tone = "bad"
    headline = "Check it is real before you spend the hour"
    advice =
      "Send two lines to someone on the team asking whether the role is still open. If nobody answers in a week, that answered it."
  } else if (ageTone === "warn" && specTone === "warn") {
    tone = "bad"
    headline = "Old and vague — treat this one with suspicion"
    advice =
      "An old posting written in boilerplate is the combination most associated with keeping a pipeline warm. Reach a human first, tailor second."
  } else if (ageTone === "warn") {
    tone = "warn"
    headline = "Worth doing, but ask one question first"
    advice =
      "Nothing here says fake. It says slow. A one-line note to the recruiter asking where they are in the process costs a minute and can save the hour."
  } else if (specTone === "warn") {
    tone = "warn"
    headline = "Recent, but there is little to work with"
    advice =
      "The posting barely describes the job, so a tailored application has nothing to mirror. Find someone who can tell you what the team actually needs before writing anything long."
  } else if (ageTone === "good" && specTone === "good") {
    tone = "good"
    headline = "Spend the hour on this one"
    advice =
      "Posted in the last week and written for a real team. This is where a tailored application actually converts, so do it properly rather than adding it to a pile."
  } else if (ageTone === "good") {
    tone = "good"
    headline = "Get in early"
    advice = `Posted ${days === 0 ? "today" : plural(days ?? 0, "day") + " ago"}. Early applications are read by a human far more often, so being quick matters more here than being perfect.`
  } else if (specTone === "good") {
    tone = "good"
    headline = "Written for a real team"
    advice =
      "Specific enough to tailor against properly, and it names things you can ask about. Still inside the window where shortlists get drawn."
  } else {
    headline = "Ordinary posting"
    advice = "Nothing stands out either way. Judge it on the role and the match, not on these signals."
  }

  if (dossier?.facts && Object.keys(dossier.facts).length > 0) {
    signals.push(...companyFacts(dossier))
  }

  return { signals, headline, advice, tone }
}

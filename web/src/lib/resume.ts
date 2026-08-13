/**
 * Reading a resume the way an applicant tracking system does.
 *
 * Runs entirely in this browser. The resume is never uploaded, never sent to a
 * model, never logged. That is not only a privacy stance — it is what makes the
 * tool free to run forever, because there is nothing to pay for.
 *
 * The scoring follows the methodology Jobscan documents publicly: a weighted
 * composite of keyword coverage, title alignment, section completeness and
 * formatting compliance. Two details matter and are easy to get wrong:
 *
 *   1. Full marks are NOT 100% keyword coverage. Real ATS screens and human
 *      recruiters both flag a resume that mirrors the posting exactly as
 *      keyword stuffing. The target band is 65–80%.
 *   2. Not every missing keyword matters equally. A posting that mentions
 *      Figma is telling you nothing, because every design posting mentions
 *      Figma. The IDF weights computed across the whole crawl are what
 *      separate a real gap from boilerplate.
 */

import type { Job } from "./types"

export interface Gap {
  term: string
  group: string
  idf: number
  weight: number
  /** True when your profile claims this term, so the gap is wording, not skill. */
  claimed?: boolean
}

export interface FormatIssue {
  rule: string
  detail: string
  severity: "blocking" | "warning"
}

export interface MatchResult {
  score: number
  keywordScore: number
  titleScore: number
  sectionScore: number
  formatScore: number
  covered: Gap[]
  missing: Gap[]
  /** Wanted, claimed in your profile, absent from the resume. Free to fix. */
  unwritten: Gap[]
  coverage: number
  weightedCoverage: number
  issues: FormatIssue[]
  sectionsFound: string[]
  sectionsMissing: string[]
  verdict: string
  suggestions: string[]
}

const SECTIONS: Array<{ key: string; patterns: RegExp }> = [
  { key: "Summary", patterns: /\b(summary|profile|objective|about me)\b/i },
  { key: "Work Experience", patterns: /\b(experience|employment|work history|professional experience)\b/i },
  { key: "Skills", patterns: /\b(skills|competencies|toolkit|technical skills)\b/i },
  { key: "Education", patterns: /\b(education|academic|qualifications)\b/i },
]

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
}

export function hasTerm(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(haystack)
}

/**
 * The formatting checklist that actually breaks parsers, per Jobscan's
 * published guidance. Text extracted from a PDF cannot reveal everything —
 * a text box looks like a paragraph once flattened — so this reports only
 * what is genuinely detectable and says so rather than inventing checks.
 */
export function formatIssues(resume: string): FormatIssue[] {
  const issues: FormatIssue[] = []
  const raw = resume

  if (!raw.trim()) return issues

  // Multi-column layouts and tables both survive extraction as runs of two or
  // more spaces used as a column gutter.
  const gutterLines = raw.split("\n").filter((line) => /\S {3,}\S/.test(line)).length
  if (gutterLines > Math.max(4, raw.split("\n").length * 0.15)) {
    issues.push({
      rule: "Single column only",
      detail: `${gutterLines} lines look like columns or a table. ATS parsers read columns in the wrong order and merge them into nonsense.`,
      severity: "blocking",
    })
  }

  const fancyBullets = raw.match(/[▪▸►❖✦✔✓→⇒★☆■□●]/g)
  if (fancyBullets && fancyBullets.length > 2) {
    issues.push({
      rule: "Plain bullets only",
      detail: `${fancyBullets.length} decorative bullet glyphs. Many parsers turn these into "?" or drop the line.`,
      severity: "warning",
    })
  }

  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(raw)) {
    issues.push({
      rule: "No icons or emoji",
      detail: "Emoji and icon glyphs parse as null characters, and can take the adjacent text with them.",
      severity: "warning",
    })
  }

  // Dates without a month make years-of-experience arithmetic guesswork.
  const bareYearRanges = raw.match(/\b(19|20)\d{2}\s*[-–—]\s*((19|20)\d{2}|present)\b/gi) ?? []
  const monthDates = raw.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(19|20)\d{2}/gi,
  ) ?? []
  if (bareYearRanges.length > 1 && monthDates.length < bareYearRanges.length) {
    issues.push({
      rule: "Include months in dates",
      detail: `${bareYearRanges.length} date ranges give only years. Parsers use months to compute your years of experience; without them they guess low.`,
      severity: "warning",
    })
  }

  if (/\b\d{1,2}['’]\d{2}\b/.test(raw)) {
    issues.push({
      rule: "No apostrophe years",
      detail: "Dates like Jan '21 confuse date parsers. Write January 2021.",
      severity: "warning",
    })
  }

  const contact = /@|\+?\d[\d\s-]{7,}/.test(raw.slice(0, 700))
  if (!contact) {
    issues.push({
      rule: "Contact details in the body",
      detail: "No email or phone found near the top. If they sit in a Word header or footer, the ATS cannot see them at all.",
      severity: "blocking",
    })
  }

  if (raw.length < 900) {
    issues.push({
      rule: "Extractable text",
      detail: `Only ${raw.length} characters came out. If the file is an image-based PDF, an ATS reads nothing whatsoever.`,
      severity: "blocking",
    })
  }

  return issues
}

export function matchResume(
  resume: string,
  job: Job,
  idf: Record<string, number>,
  /**
   * What the profile says you can do. A term the posting wants, that you claim,
   * and that your resume never says, is not a gap in your experience — it is a
   * gap in your writing, and it is the cheapest thing on this page to fix. The
   * board scores against these; the ATS only ever sees the resume. Without this
   * split the same screen said "overlaps your strengths: enterprise" and listed
   * enterprise under what you are missing.
   */
  strengths: string[] = [],
): MatchResult {
  const body = normalise(resume)
  const terms = Array.from(new Set(job.keywords))
  const claimed = new Set(strengths.map((s) => s.toLowerCase().trim()).filter(Boolean))

  const covered: Gap[] = []
  const missing: Gap[] = []

  for (const term of terms) {
    const weight = idf[term] ?? 1
    const entry: Gap = {
      term,
      group:
        Object.entries(job.keyword_groups).find(([, list]) => list.includes(term))?.[0] ?? "other",
      idf: weight,
      weight,
      claimed: claimed.has(term.toLowerCase()),
    }
    if (hasTerm(body, term)) covered.push(entry)
    else missing.push(entry)
  }

  missing.sort((a, b) => b.weight - a.weight)
  const unwritten = missing.filter((g) => g.claimed)
  covered.sort((a, b) => b.weight - a.weight)

  const totalWeight = terms.reduce((sum, t) => sum + (idf[t] ?? 1), 0)
  const coveredWeight = covered.reduce((sum, g) => sum + g.weight, 0)
  const coverage = terms.length ? covered.length / terms.length : 0
  const weightedCoverage = totalWeight ? coveredWeight / totalWeight : 0

  // 65–80% is the target band. Below it you look unqualified; above it you look
  // like you pasted the posting into your resume, which recruiters do notice.
  let keywordScore: number
  if (weightedCoverage >= 0.65 && weightedCoverage <= 0.8) keywordScore = 100
  else if (weightedCoverage < 0.65) keywordScore = Math.round((weightedCoverage / 0.65) * 100)
  else keywordScore = Math.round(100 - (weightedCoverage - 0.8) * 120)

  const jobTitle = normalise(job.title).replace(/\(.*?\)/g, "").trim()
  const titleWords = jobTitle.split(" ").filter((w) => w.length > 2)
  const titleHits = titleWords.filter((w) => body.includes(w)).length
  const titleScore = titleWords.length ? Math.round((titleHits / titleWords.length) * 100) : 0

  const sectionsFound = SECTIONS.filter((s) => s.patterns.test(resume)).map((s) => s.key)
  const sectionsMissing = SECTIONS.filter((s) => !s.patterns.test(resume)).map((s) => s.key)
  const sectionScore = Math.round((sectionsFound.length / SECTIONS.length) * 100)

  const issues = formatIssues(resume)
  const penalty = issues.reduce((sum, i) => sum + (i.severity === "blocking" ? 25 : 8), 0)
  const formatScore = Math.max(0, 100 - penalty)

  const score = Math.round(
    keywordScore * 0.45 + titleScore * 0.2 + sectionScore * 0.15 + formatScore * 0.2,
  )

  const suggestions: string[] = []
  const topGaps = missing.slice(0, 5)
  if (topGaps.length) {
    suggestions.push(
      `Work these into a bullet with evidence, hardest-to-fake first: ${topGaps
        .map((g) => g.term)
        .join(", ")}.`,
    )
  }
  if (titleScore < 70) {
    suggestions.push(
      `Your headline does not say "${job.title}". Recruiters and parsers both match on it — mirror the exact title if it is honest to do so.`,
    )
  }
  if (sectionsMissing.length) {
    suggestions.push(
      `Add a plainly-titled ${sectionsMissing.join(" and ")} section. Creative headings get filed under nothing.`,
    )
  }
  if (weightedCoverage > 0.85) {
    suggestions.push(
      "Coverage is above 85%, which reads as keyword stuffing. Cut the terms you cannot defend in an interview.",
    )
  }
  if (job.years_min && job.years_min > 0) {
    suggestions.push(
      `The posting asks for ${job.years_min}+ years. Make sure a total is stated plainly somewhere near the top.`,
    )
  }

  let verdict: string
  if (score >= 80) verdict = "Strong. Apply as-is, or after the one edit below."
  else if (score >= 65) verdict = "Competitive once you close the top gaps."
  else if (score >= 45) verdict = "Needs a tailored pass before this is worth sending."
  else verdict = "Weak against this posting. Either rewrite substantially or spend the hour elsewhere."

  return {
    score,
    keywordScore,
    titleScore,
    sectionScore,
    formatScore,
    covered,
    missing,
    unwritten,
    coverage,
    weightedCoverage,
    issues,
    sectionsFound,
    sectionsMissing,
    verdict,
    suggestions,
  }
}

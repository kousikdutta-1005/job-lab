import { useEffect, useMemo, useRef, useState } from "react"
import type {
  Application,
  CompanyDossier,
  CompanyInfo,
  Contact,
  Job,
  Profile,
  Settings,
} from "@/lib/types"
import { copy, logoFor, money, scoreClass } from "@/lib/format"
import { drafts, mailto, renderPattern } from "@/lib/email"
import { matchResume } from "@/lib/resume"
import { agenda, likelyQuestions, portfolioPlan } from "@/lib/prep"
import { vet, ageTone, postedLabel } from "@/lib/vetting"
import { worthYourHour } from "@/lib/outcomes"
import { interviewStoryBank, linkedinBridge } from "@/lib/customer"

interface Props {
  job: Job
  company?: CompanyInfo
  profile: Profile
  dossier?: CompanyDossier
  settings: Settings
  idf: Record<string, number>
  application?: Application
  applications: Application[]
  jobs: Job[]
  contacts: Contact[]
  onApply: (job: Job) => void
  onStage: (job: Job, stage: Application["stage"]) => void
  onAddContact: (seed: Partial<Contact>) => void
  onOpenSettings: () => void
  onClose: () => void
}

type Tab = "packet" | "role" | "match" | "people" | "write" | "prep"
const JOB_TABS: Tab[] = ["packet", "role", "match", "people", "write", "prep"]

interface DecisionStep {
  label: string
  status: "ready" | "warn" | "blocked"
  detail: string
}

function stepClass(status: DecisionStep["status"]): string {
  if (status === "ready") return "pill-good"
  if (status === "blocked") return "pill-bad"
  return "pill-warn"
}

function followUpPlan(job: Job): string {
  if (ageTone(job) === "bad") {
    return "Today: ask a human if the role is still live. Day 7: archive it unless someone replies."
  }
  if (job.match_score >= 90) {
    return "Today: apply and message one human. Day 3: short follow-up. Day 10: second and final follow-up."
  }
  return "Today: shortlist or apply only if the packet is ready. Day 5: one follow-up. Day 12: archive if cold."
}

export function JobDetail({
  job,
  company,
  dossier,
  profile,
  settings,
  idf,
  application,
  applications,
  jobs,
  contacts,
  onApply,
  onStage,
  onAddContact,
  onOpenSettings,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>("role")
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [draftKey, setDraftKey] = useState("hiring_manager")
  const [person, setPerson] = useState({ first: "", last: "" })
  const titleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (window.matchMedia("(max-width: 760px)").matches) titleRef.current?.focus()
  }, [job.id])

  function moveTab(event: React.KeyboardEvent<HTMLButtonElement>, current: Tab): void {
    let next: Tab | undefined
    const index = JOB_TABS.indexOf(current)
    if (event.key === "Home") next = JOB_TABS[0]
    if (event.key === "End") next = JOB_TABS[JOB_TABS.length - 1]
    if (event.key === "ArrowRight") {
      next = JOB_TABS[(index + 1) % JOB_TABS.length]
    }
    if (event.key === "ArrowLeft") {
      next = JOB_TABS[(index - 1 + JOB_TABS.length) % JOB_TABS.length]
    }
    if (!next) return
    event.preventDefault()
    setTab(next)
    requestAnimationFrame(() => document.getElementById(`job-tab-${next}`)?.focus())
  }

  const vetting = useMemo(() => vet(job, dossier), [job, dossier])

  const match = useMemo(
    () =>
      settings.resume_text
        ? matchResume(settings.resume_text, job, idf, profile.strengths ?? [])
        : null,
    [settings.resume_text, job, idf],
  )

  const allDrafts = useMemo(
    () => drafts(job, settings, idf, person.first || "there", profile.strengths ?? []),
    [job, settings, idf, person.first],
  )
  const draft = allDrafts.find((d) => d.key === draftKey) ?? allDrafts[0]

  const patterns = company?.contacts?.patterns ?? []
  const domain = company?.domain ?? job.company_domain ?? null
  const guessedEmail =
    person.first && domain && patterns[0]
      ? renderPattern(patterns[0].pattern, person.first, person.last, domain)
      : ""

  const relatedContacts = contacts.filter(
    (c) => c.company.toLowerCase() === job.company.toLowerCase(),
  )

  const resumeReady = Boolean(settings.resume_text.trim())
  const autofillReady = Boolean(
    settings.full_name.trim() &&
      settings.email.trim() &&
      settings.phone.trim() &&
      (settings.portfolio.trim() || profile.portfolio.trim()),
  )
  const contactReady = relatedContacts.length > 0 || job.linkedin.searches.length > 0
  const emailReady = Boolean(domain && patterns.length > 0)
  const resumeScore = match?.score ?? null
  const oldPosting = ageTone(job) === "bad"
  const riskyPosting = ageTone(job) === "warn" || vetting.tone === "bad" || vetting.tone === "warn"

  const decisionSteps: DecisionStep[] = [
    {
      label: "Role fit",
      status: job.eligible ? (oldPosting ? "warn" : "ready") : "blocked",
      detail: job.eligible
        ? oldPosting
          ? "Ask if this is still live before tailoring."
          : `${job.match_score}/100 profile fit, ${job.seniority_label.toLowerCase()}.`
        : job.eligibility_reason,
    },
    {
      label: "Resume",
      status: !resumeReady ? "blocked" : resumeScore !== null && resumeScore < 65 ? "warn" : "ready",
      detail: !resumeReady
        ? "Paste one resume once in Settings."
        : resumeScore !== null
          ? `${resumeScore}/100 ATS match${resumeScore < 65 ? "; fix gaps first." : "."}`
          : "Loaded; open Resume tab for the ATS read.",
    },
    {
      label: "Human",
      status: contactReady ? "ready" : "warn",
      detail: relatedContacts.length
        ? `${relatedContacts.length} saved contact${relatedContacts.length === 1 ? "" : "s"} at ${job.company}.`
        : job.linkedin.searches.length
          ? "LinkedIn searches are ready; find one person before applying."
          : "No contact path yet; avoid a cold-only application.",
    },
    {
      label: "Send",
      status: autofillReady && emailReady ? "ready" : autofillReady ? "warn" : "blocked",
      detail: !autofillReady
        ? "Fill name, email, phone and portfolio in Settings."
        : emailReady
          ? "Autofill and email-pattern tools are ready."
          : "Autofill is ready; email pattern is unknown.",
    },
  ]

  const blocked = decisionSteps.some((step) => step.status === "blocked")
  const warned = decisionSteps.some((step) => step.status === "warn")
  const nextMove = !job.eligible
    ? "Skip unless you can solve the location lock"
    : oldPosting
      ? "Verify with a human before tailoring"
      : !resumeReady
        ? "Add your resume before applying"
        : resumeScore !== null && resumeScore < 65
          ? "Fix the resume gaps first"
          : !contactReady
            ? "Find a recruiter or design lead first"
            : riskyPosting
              ? "Apply, but send a human check-in too"
              : "Apply properly now"
  const nextTone = blocked ? "bad" : warned || riskyPosting ? "warn" : "good"
  const prepTerms = agenda(job, idf, 6)
  const portfolioSections = portfolioPlan(job, idf)
  const worth = worthYourHour(
    job,
    applications,
    contacts,
    jobs,
    resumeScore,
    portfolioSections.length > 0 || Boolean(settings.portfolio.trim() || profile.portfolio.trim()),
  )
  const linkedinChecklist = linkedinBridge(job, settings, match)
  const storyBank = interviewStoryBank(job, match)
  const rewriteIdeas = match
    ? [
        ...match.unwritten.slice(0, 3).map((gap) => ({
          label: `Add "${gap.term}"`,
          detail: `Your profile already claims this, but the resume text does not. Add one truthful bullet using the term.`,
        })),
        ...match.missing
          .filter((gap) => !gap.claimed)
          .slice(0, Math.max(0, 3 - match.unwritten.length))
          .map((gap) => ({
            label: `Prove or skip "${gap.term}"`,
            detail: `High-value ${gap.group} requirement. Only add it if a real project proves it.`,
          })),
      ].slice(0, 3)
    : []
  const primarySearch =
    job.linkedin.searches.find((search) => search.kind === "decision-maker") ??
    job.linkedin.searches.find((search) => search.kind === "recruiter") ??
    job.linkedin.searches[0]
  const readinessScore = Math.round(
    decisionSteps.reduce((sum, step) => sum + (step.status === "ready" ? 25 : step.status === "warn" ? 12 : 0), 0),
  )
  const packetLines = [
    `Role: ${job.title} at ${job.company} (${job.match_score}/100 fit).`,
    `Worth your hour: ${worth.score}/100 — ${worth.label}.`,
    `Verdict: ${nextMove}.`,
    `Resume: ${
      match
        ? `${match.score}/100 ATS; ${
            rewriteIdeas[0]?.label ?? "review keyword coverage before sending"
          }`
        : "resume missing; add it before applying"
    }.`,
    `Portfolio: ${portfolioSections[0]?.items[0] ?? "choose a case study that proves the strongest posting themes"}.`,
    `Human path: ${
      relatedContacts[0]?.name ??
      (primarySearch ? `${primarySearch.label} on LinkedIn` : "find one recruiter or design lead")
    }.`,
    `Outreach: ${draft.subject}.`,
    `Follow-up: ${followUpPlan(job)}`,
  ].join("\n")
  const kitCards = [
    {
      title: "Resume rewrite",
      label: match ? `${match.score}/100 ATS` : "resume missing",
      tone: !resumeReady ? "bad" : resumeScore !== null && resumeScore < 65 ? "warn" : "good",
      detail: rewriteIdeas[0]?.detail ?? (resumeReady ? "Open Resume for keyword coverage and parser issues." : "Paste your resume once to unlock JD-specific rewrites."),
      tab: "match" as Tab,
    },
    {
      title: "Hiring team",
      label: relatedContacts.length ? `${relatedContacts.length} saved` : primarySearch?.kind ?? "search",
      tone: contactReady ? "good" : "warn",
      detail: relatedContacts.length
        ? `${relatedContacts[0].name} is already in your contact list.`
        : primarySearch
          ? `Start with ${primarySearch.label}; it is the shortest path to a human.`
          : "No people path yet.",
      tab: "people" as Tab,
    },
    {
      title: "Outreach",
      label: emailReady ? "email ready" : "draft ready",
      tone: autofillReady && emailReady ? "good" : autofillReady ? "warn" : "bad",
      detail: emailReady
        ? "Email pattern, subject and body can be copied in one pass."
        : "Drafts are ready; fill Settings/contact name to personalize them.",
      tab: "write" as Tab,
    },
    {
      title: "Portfolio proof",
      label: prepTerms[0] ?? "case study",
      tone: portfolioSections.length ? "good" : "warn",
      detail: portfolioSections[0]?.items[0] ?? "Use the prep tab to choose the case study angle for this role.",
      tab: "prep" as Tab,
    },
  ]

  async function flash(label: string, text: string) {
    if (await copy(text)) {
      setCopied(label)
      setTimeout(() => setCopied(null), 1600)
    }
  }

  const logo = logoFor(domain)

  return (
    <div className="detail">
      <div className="detail-head">
        <button className="chip detail-back" onClick={onClose}>
          ← Back to the list
        </button>
        <div className="row" style={{ marginBottom: 8 }}>
          <span className={`job-score ${scoreClass(job.match_score)}`}>{job.match_score}</span>
          {logo && (
            <img
              src={logo}
              alt=""
              width={17}
              height={17}
              style={{ borderRadius: 4, opacity: 0.9 }}
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.display = "none"
              }}
            />
          )}
          <span className="job-company">{job.company}</span>
          <span className="dim tiny dot-sep">{job.location_raw || "location not stated"}</span>
          {!job.eligible && <span className="tag-locked">{job.region_lock ?? "locked"}</span>}
          {application && <span className="tag-applied">{application.stage}</span>}
        </div>

        <h1 ref={titleRef} tabIndex={-1}>{job.title}</h1>

        <div className="row wrap" style={{ marginTop: 9, gap: 6 }}>
          <span className="pill">{job.seniority_label}</span>
          <span className="pill">{job.workplace}</span>
          {job.years_min !== null && <span className="pill">{job.years_min}+ yrs</span>}
          {job.salary_parsed && (
            <span className="pill pill-accent">
              {money(job.salary_parsed.low, job.salary_parsed.currency)} –{" "}
              {money(job.salary_parsed.high, job.salary_parsed.currency)}
            </span>
          )}
          <span className="pill">{job.source}</span>
          <span
            className={`pill ${
              ageTone(job) === "bad" ? "pill-bad" : ageTone(job) === "warn" ? "pill-warn" : "dim"
            }`}
          >
            {postedLabel(job)}
          </span>
        </div>

        <div className="row" style={{ marginTop: 12, gap: 7 }}>
          <button className="btn btn-primary" onClick={() => onApply(job)}>
            Open &amp; track application →
          </button>
          {application ? (
            <select
              aria-label={`Application stage for ${job.title}`}
              value={application.stage}
              onChange={(e) => onStage(job, e.target.value as Application["stage"])}
              style={{ width: "auto", padding: "7px 9px" }}
            >
              {["wishlist", "applied", "phone_screen", "interview", "offer", "accepted", "rejected", "withdrawn", "archived"].map(
                (s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ),
              )}
            </select>
          ) : (
            <button className="btn" onClick={() => onStage(job, "wishlist")}>
              Shortlist
            </button>
          )}
        </div>
      </div>

      <div className="detail-body">
        <div className={`card decision decision-${nextTone}`}>
          <div className="row-between" style={{ alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div className="kicker">Next move · Worth your hour {worth.score}/100</div>
              <h3>{nextMove}</h3>
            </div>
            <span className={`pill ${nextTone === "good" ? "pill-good" : nextTone === "bad" ? "pill-bad" : "pill-warn"}`}>
              {nextTone === "good" ? "ready" : nextTone === "bad" ? "blocked" : "check first"}
            </span>
          </div>

          <div className="decision-grid">
            {decisionSteps.map((step) => (
              <div key={step.label} className={`decision-step ${step.status}`}>
                <div className="row-between" style={{ marginBottom: 5 }}>
                  <strong>{step.label}</strong>
                  <span className={`pill ${stepClass(step.status)}`}>{step.status}</span>
                </div>
                <p className="tiny dimmer">{step.detail}</p>
              </div>
            ))}
          </div>

          <div className="kit-grid">
            {kitCards.map((card) => (
              <button key={card.title} className={`kit-card ${card.tone}`} onClick={() => setTab(card.tab)}>
                <span className="kicker">{card.title}</span>
                <strong>{card.label}</strong>
                <small>{card.detail}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="tabs" role="tablist" aria-label="Job detail sections">
          {(
            [
              ["packet", `Apply packet ${readinessScore}`],
              ["role", "The role"],
              ["match", match ? `Resume ${match.score}` : "Resume"],
              ["people", "Who to contact"],
              ["write", "Write to them"],
              ["prep", "Prepare"],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              id={`job-tab-${key}`}
              role="tab"
              aria-selected={tab === key}
              aria-controls={`job-panel-${key}`}
              tabIndex={tab === key ? 0 : -1}
              className={tab === key ? "on" : ""}
              onClick={() => setTab(key)}
              onKeyDown={(event) => moveTab(event, key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          id={`job-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`job-tab-${tab}`}
          tabIndex={0}
        >
        {tab === "packet" && (
          <>
            <div className={`card packet packet-${nextTone}`}>
              <div className="row-between" style={{ alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div className="kicker">Application assembly line</div>
                  <h3>One packet for this role</h3>
                </div>
                <div className="packet-score">
                  {readinessScore}
                  <span>/100</span>
                </div>
              </div>

              <div className="packet-grid">
                <div>
                  <div className="kicker">0 · Worth your hour</div>
                  <strong>{worth.score}/100 · {worth.label}</strong>
                  <p className="tiny dimmer">{worth.verdict}</p>
                </div>
                <div>
                  <div className="kicker">1 · Gate</div>
                  <strong>{nextMove}</strong>
                  <p className="tiny dimmer">{vetting.advice}</p>
                </div>
                <div>
                  <div className="kicker">2 · Resume move</div>
                  <strong>{match ? (rewriteIdeas[0]?.label ?? `${match.score}/100 ATS`) : "Add resume first"}</strong>
                  <p className="tiny dimmer">
                    {rewriteIdeas[0]?.detail ??
                      (match
                        ? "Resume is loaded; review coverage before sending."
                        : "The app cannot tailor or score the packet without the resume text.")}
                  </p>
                </div>
                <div>
                  <div className="kicker">3 · Portfolio angle</div>
                  <strong>{prepTerms.slice(0, 2).join(" + ") || "Case study proof"}</strong>
                  <p className="tiny dimmer">
                    {portfolioSections[0]?.items[0] ??
                      "Pick the case study that proves the strongest theme in this posting."}
                  </p>
                </div>
                <div>
                  <div className="kicker">4 · Human path</div>
                  <strong>{relatedContacts[0]?.name ?? primarySearch?.label ?? "Find a human"}</strong>
                  <p className="tiny dimmer">
                    {relatedContacts[0]
                      ? `${relatedContacts[0].title || relatedContacts[0].relationship} is already saved.`
                      : primarySearch
                        ? `Open the ${primarySearch.kind} search before or right after applying.`
                        : "Do not rely only on the ATS if there is no visible contact path."}
                  </p>
                </div>
                <div>
                  <div className="kicker">5 · Outreach copy</div>
                  <strong>{draft.subject}</strong>
                  <p className="tiny dimmer">
                    {emailReady
                      ? "Email pattern is available; fill the person name to generate an address."
                      : "Draft is ready, but email pattern is unknown. LinkedIn note is safer."}
                  </p>
                </div>
                <div>
                  <div className="kicker">6 · Follow-up plan</div>
                  <strong>{application ? application.stage.replace("_", " ") : "not tracked yet"}</strong>
                  <p className="tiny dimmer">{followUpPlan(job)}</p>
                </div>
              </div>

              <div className="worth-strip">
                {worth.signals.map((signal) => (
                  <div key={signal.label} className={`worth-signal tone-${signal.tone}`}>
                    <div className="row-between">
                      <span className="kicker">{signal.label}</span>
                      <span className="mono tiny">{signal.points >= 0 ? "+" : ""}{signal.points}</span>
                    </div>
                    <strong>{signal.value}</strong>
                    <p>{signal.detail}</p>
                  </div>
                ))}
              </div>

              <div className="field" style={{ marginTop: 12 }}>
                <label>Copyable packet brief</label>
                <textarea aria-label="Application packet brief" readOnly rows={9} value={packetLines} />
              </div>

              <div className="row wrap" style={{ gap: 7 }}>
                <button className="btn btn-primary btn-sm" onClick={() => flash("packet", packetLines)}>
                  {copied === "packet" ? "Copied" : "Copy packet"}
                </button>
                <button className="btn btn-sm" onClick={() => setTab("match")}>
                  Fix resume
                </button>
                <button className="btn btn-sm" onClick={() => setTab("people")}>
                  Find human
                </button>
                <button className="btn btn-sm" onClick={() => setTab("write")}>
                  Write outreach
                </button>
                <button className="btn btn-sm" onClick={() => onStage(job, "wishlist")}>
                  Save to pipeline
                </button>
              </div>
            </div>
          </>
        )}

        {tab === "role" && (
          <>
            <div className={`card vet vet-${vetting.tone}`}>
              <h3>{vetting.headline}</h3>
              <p className="tiny vet-advice">{vetting.advice}</p>
              <div className="vet-grid">
                {vetting.signals.map((signal) => (
                  <div key={signal.label + signal.value} className={`vet-row tone-${signal.tone}`}>
                    <div className="vet-head">
                      <span className="kicker">{signal.label}</span>
                      <strong>{signal.value}</strong>
                    </div>
                    {signal.note && <p className="tiny">{signal.note}</p>}
                    {signal.source &&
                      (signal.source.startsWith("http") ? (
                        <a className="tiny vet-src" href={signal.source} target="_blank" rel="noreferrer">
                          source
                        </a>
                      ) : (
                        <span className="tiny vet-src">from {signal.source}</span>
                      ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h3>Why this ranks {job.match_score} against your profile</h3>
              <ul className="reasons">
                {job.match_reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {!job.eligible && (
                <p className="tiny" style={{ color: "var(--bad)", marginTop: 10, marginBottom: 0 }}>
                  {job.eligibility_reason}. Shown so you can judge it, not hidden — but expect this
                  one to need a visa or a company willing to hire across borders.
                </p>
              )}
            </div>

            {Object.keys(job.keyword_groups).length > 0 && (
              <div className="card">
                <h3>What they are asking for</h3>
                {Object.entries(job.keyword_groups).map(([group, terms]) => (
                  <div key={group} style={{ marginBottom: 9 }}>
                    <div className="kicker">{group}</div>
                    <div className="wrap">
                      {terms.map((term) => (
                        <span key={term} className="pill">
                          {term}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="card">
              <h3>The posting</h3>
              {job.description_text ? (
                <>
                  <div className={`jd${expanded ? " open" : ""}`}>{job.description_text}</div>
                  <button
                    className="btn btn-sm"
                    style={{ marginTop: 10 }}
                    onClick={() => setExpanded((v) => !v)}
                  >
                    {expanded ? "Collapse" : "Read all"}
                  </button>
                </>
              ) : (
                <p className="dim tiny" style={{ margin: 0 }}>
                  This source lists the role without the body text. Open the posting to read it.
                </p>
              )}
              <div className="row" style={{ marginTop: 12 }}>
                <a className="btn btn-sm" href={job.url} target="_blank" rel="noopener noreferrer">
                  View original on {job.source} →
                </a>
              </div>
            </div>
          </>
        )}

        {tab === "match" && (
          <>
            {!settings.resume_text ? (
              <div className="card">
                <h3>No resume loaded</h3>
                <p className="dim tiny">
                  Paste your resume once in Settings and every role gets an ATS match here, with
                  the gaps ranked by how rare each one is. The number on the board is a different
                  measure — how well the role fits your profile — and it does not move when you add
                  a resume. Your resume stays in this browser and is never uploaded anywhere.
                </p>
                <button className="btn btn-sm" onClick={onOpenSettings}>
                  Add resume in Settings
                </button>
              </div>
            ) : (
              match && (
                <>
                  <div className="card">
                    <div className="row-between" style={{ marginBottom: 12 }}>
                      <div>
                        <div className="kicker">ATS match</div>
                        <div className="mono" style={{ fontSize: 30, letterSpacing: "-0.02em" }}>
                          {match.score}
                          <span className="dimmer" style={{ fontSize: 15 }}>
                            /100
                          </span>
                        </div>
                      </div>
                      <p className="tiny dim" style={{ maxWidth: "50ch", margin: 0 }}>
                        {match.verdict}
                      </p>
                    </div>
                    <div className="grid-3">
                      {[
                        ["Keywords", match.keywordScore],
                        ["Title", match.titleScore],
                        ["Sections", match.sectionScore],
                        ["Formatting", match.formatScore],
                      ].map(([label, value]) => (
                        <div key={label as string}>
                          <div className="row-between tiny" style={{ marginBottom: 4 }}>
                            <span className="dim">{label}</span>
                            <span className="mono">{value as number}</span>
                          </div>
                          <div className="meter">
                            <i style={{ width: `${value as number}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="tiny dimmer" style={{ marginTop: 12, marginBottom: 0 }}>
                      Keyword coverage is {(match.weightedCoverage * 100).toFixed(0)}% by
                      importance. The target is 65–80% — full marks are not 100%, because a resume
                      that mirrors the posting exactly reads as keyword stuffing.
                    </p>
                  </div>

                  {match.unwritten.length > 0 && (
                    <div className="card">
                      <h3>You can do these. Your resume never says so.</h3>
                      <p className="tiny dimmer" style={{ marginTop: -4 }}>
                        This posting asks for {match.unwritten.length === 1 ? "this" : "these"}, your
                        profile says you have {match.unwritten.length === 1 ? "it" : "them"}, and the
                        words are not in the file an ATS will read. Cheapest points on this page —
                        no new experience needed, only the sentence you already earned.
                      </p>
                      <div className="wrap">
                        {match.unwritten.map((gap) => (
                          <span
                            key={gap.term}
                            className="pill pill-good"
                            title={`In your profile, absent from your resume · ${gap.group}`}
                          >
                            {gap.term}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {match.missing.length > match.unwritten.length && (
                    <div className="card">
                      <h3>
                        {match.unwritten.length > 0 ? "Genuinely missing" : "Missing"}, most damaging
                        first
                      </h3>
                      <p className="tiny dimmer" style={{ marginTop: -4 }}>
                        Ranked by how rare each term is across all {Object.keys(idf).length} terms
                        on the board. A rare term is a real requirement; a common one is filler.
                      </p>
                      <div className="wrap">
                        {match.missing
                          .filter((gap) => !gap.claimed)
                          .slice(0, 18)
                          .map((gap) => (
                            <span
                              key={gap.term}
                              className={`pill ${gap.idf > 2.4 ? "pill-bad" : gap.idf > 1.8 ? "pill-warn" : ""}`}
                              title={`Rarity ${gap.idf.toFixed(2)} · ${gap.group}`}
                            >
                              {gap.term}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}

                  {match.issues.length > 0 && (
                    <div className="card">
                      <h3>Formatting that breaks parsers</h3>
                      <div className="link-list">
                        {match.issues.map((issue) => (
                          <div key={issue.rule} className="link-row" style={{ alignItems: "flex-start" }}>
                            <div>
                              <div style={{ fontWeight: 550, marginBottom: 2 }}>{issue.rule}</div>
                              <div className="tiny dim">{issue.detail}</div>
                            </div>
                            <span className={`pill ${issue.severity === "blocking" ? "pill-bad" : "pill-warn"}`}>
                              {issue.severity}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {match.suggestions.length > 0 && (
                    <div className="card">
                      <h3>What to change before you send</h3>
                      <ul className="reasons">
                        {match.suggestions.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {rewriteIdeas.length > 0 && (
                    <div className="card">
                      <h3>ATS rewrite kit</h3>
                      <p className="tiny dimmer" style={{ marginTop: -4 }}>
                        These are wording tasks, not invented experience. If a line says prove or skip,
                        do not fake it — use a real project or leave it out.
                      </p>
                      <div className="link-list">
                        {rewriteIdeas.map((idea) => (
                          <div key={idea.label} className="link-row" style={{ alignItems: "flex-start" }}>
                            <div>
                              <div style={{ fontWeight: 550 }}>{idea.label}</div>
                              <div className="tiny dim">{idea.detail}</div>
                            </div>
                            <span className="pill pill-accent">rewrite</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="card">
                    <h3>Already covered</h3>
                    <div className="wrap">
                      {match.covered.slice(0, 22).map((gap) => (
                        <span key={gap.term} className="pill pill-good">
                          {gap.term}
                        </span>
                      ))}
                      {match.covered.length === 0 && (
                        <span className="dim tiny">Nothing from this posting appears in your resume yet.</span>
                      )}
                    </div>
                  </div>
                </>
              )
            )}
          </>
        )}

        {tab === "people" && (
          <>
            <div className="card">
              <h3>Find the decision-maker</h3>
              <p className="tiny dimmer" style={{ marginTop: -4 }}>
                These open a LinkedIn search already filtered to {job.company}. Nothing is scraped —
                LinkedIn runs the search, which is why these keep working.
              </p>
              <div className="link-list">
                {primarySearch && (
                  <a
                    className="link-row recommended-row"
                    href={primarySearch.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span>
                      <strong>Start here: {primarySearch.label}</strong>
                      <span className="tiny dimmer" style={{ display: "block", marginTop: 2 }}>
                        Highest-probability human path for this role.
                      </span>
                    </span>
                    <span className="pill pill-accent">{primarySearch.kind}</span>
                  </a>
                )}
                {job.linkedin.searches.map((search) => (
                  <a
                    key={search.url}
                    className="link-row"
                    href={search.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span>{search.label}</span>
                    <span className="pill">{search.kind}</span>
                  </a>
                ))}
                <a
                  className="link-row"
                  href={job.linkedin.people}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>Everyone at {job.company}</span>
                  <span className="dimmer tiny">company page →</span>
                </a>
              </div>
            </div>

            <div className="card">
              <h3>LinkedIn/referral bridge</h3>
              <p className="tiny dimmer" style={{ marginTop: -4 }}>
                Target customers keep saying referrals matter, but generic connection spam does not.
                Before messaging a human, make the profile they click feel consistent with this role.
              </p>
              <div className="link-list">
                {linkedinChecklist.map((item) => (
                  <div key={item.label} className="link-row" style={{ alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 550 }}>{item.label}</div>
                      <div className="tiny dim">{item.detail}</div>
                    </div>
                    <span className={`pill ${item.ready ? "pill-good" : "pill-warn"}`}>
                      {item.ready ? "ready" : "fix"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h3>Work out their email</h3>
              {domain ? (
                <>
                  <div className="split" style={{ marginBottom: 10 }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Their first name</label>
                      <input
                        aria-label="Contact first name"
                        type="text"
                        value={person.first}
                        placeholder="e.g. Ananya"
                        onChange={(e) => setPerson((p) => ({ ...p, first: e.target.value }))}
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Last name</label>
                      <input
                        aria-label="Contact last name"
                        type="text"
                        value={person.last}
                        placeholder="e.g. Rao"
                        onChange={(e) => setPerson((p) => ({ ...p, last: e.target.value }))}
                      />
                    </div>
                  </div>

                  {person.first ? (
                    <div className="link-list">
                      {patterns.slice(0, 5).map((pattern) => {
                        const address = renderPattern(
                          pattern.pattern,
                          person.first,
                          person.last,
                          domain,
                        )
                        return (
                          <button
                            key={pattern.pattern}
                            className="link-row"
                            onClick={() => flash(pattern.label, address)}
                          >
                            <span className="mono">{address}</span>
                            <span
                              className={`pill ${pattern.source === "observed" ? "pill-good" : ""}`}
                            >
                              {copied === pattern.label ? "copied" : pattern.source}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="tiny dim" style={{ margin: 0 }}>
                      Type a name to see the likely addresses.
                    </p>
                  )}

                  <p className="tiny dimmer" style={{ marginTop: 11, marginBottom: 0 }}>
                    {company?.contacts?.note}
                  </p>

                  {person.first && (
                    <button
                      className="btn btn-sm"
                      style={{ marginTop: 11 }}
                      onClick={() =>
                        onAddContact({
                          name: `${person.first} ${person.last}`.trim(),
                          company: job.company,
                          email: guessedEmail,
                          relationship: "hiring_manager",
                        })
                      }
                    >
                      Save to contacts
                    </button>
                  )}
                </>
              ) : (
                <p className="tiny dim" style={{ margin: 0 }}>
                  No company domain known for {job.company}, so no address pattern can be inferred.
                </p>
              )}
            </div>

            {relatedContacts.length > 0 && (
              <div className="card">
                <h3>People you already know here</h3>
                <div className="link-list">
                  {relatedContacts.map((contact) => (
                    <div key={contact.id} className="link-row">
                      <div>
                        <div style={{ fontWeight: 550 }}>{contact.name}</div>
                        <div className="tiny dim">
                          {contact.title || contact.relationship}
                          {contact.email ? ` · ${contact.email}` : ""}
                        </div>
                      </div>
                      {contact.linkedin_url && (
                        <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer">
                          open →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}


        {tab === "prep" && (
          <>
            <div className="card">
              <h3>What this posting is really about</h3>
              <p className="tiny dimmer" style={{ marginTop: -4 }}>
                The terms this posting uses that most postings do not. Every design posting says
                Figma; these are the ones that tell you what the job actually is, and what they will
                probe hardest.
              </p>
              <div className="wrap">
                {agenda(job, idf, 6).map((term) => (
                  <span key={term} className="pill pill-accent">
                    {term}
                  </span>
                ))}
              </div>
            </div>

            <div className="card">
              <h3>Questions they are likely to ask</h3>
              <ul className="reasons">
                {likelyQuestions(job).map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
              <p className="tiny dimmer" style={{ marginTop: 10, marginBottom: 0 }}>
                Weighted by which themes this posting spends the most words on. It does not know
                this company's actual process — no free source does — so treat it as the shape of
                the conversation rather than the script.
              </p>
            </div>

            <div className="card">
              <h3>Interview story bank</h3>
              <p className="tiny dimmer" style={{ marginTop: -4 }}>
                Designer candidates said portfolio interviews are where good applications still fail.
                These are not scripts; they are the four stories to have ready before the call.
              </p>
              <div className="link-list">
                {storyBank.map((story) => (
                  <div key={story.question} className="story-row">
                    <div className="row-between" style={{ alignItems: "flex-start", gap: 10 }}>
                      <strong>{story.question}</strong>
                      <span className="pill pill-accent">story</span>
                    </div>
                    <p>{story.story}</p>
                    <small>{story.proof}</small>
                  </div>
                ))}
              </div>
            </div>

            {portfolioPlan(job, idf).map((section) => (
              <div className="card" key={section.heading}>
                <h3>{section.heading}</h3>
                <ul className="reasons">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {section.note && (
                  <p className="tiny dimmer" style={{ marginTop: 10, marginBottom: 0 }}>
                    {section.note}
                  </p>
                )}
              </div>
            ))}
          </>
        )}

        {tab === "write" && (
          <>
            <div className="card">
              <div className="row wrap" style={{ marginBottom: 12, gap: 5 }}>
                {allDrafts.map((d) => (
                  <button
                    key={d.key}
                    className={`chip${draftKey === d.key ? " on" : ""}`}
                    onClick={() => setDraftKey(d.key)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="tiny dimmer" style={{ marginTop: 0 }}>
                {draft.when}
              </p>

              <div className="field">
                <label>Their name</label>
                <input
                  aria-label="Contact first name for draft"
                  type="text"
                  value={person.first}
                  placeholder="Leave blank for a neutral greeting"
                  onChange={(e) => setPerson((p) => ({ ...p, first: e.target.value }))}
                />
              </div>

              <div className="field">
                <label>Subject</label>
                <input aria-label="Outreach subject" type="text" readOnly value={draft.subject} />
              </div>

              <div className="field">
                <label>Body</label>
                <textarea aria-label="Outreach message" readOnly rows={17} value={draft.body} />
              </div>

              {(!settings.full_name || !settings.portfolio) && (
                <p className="tiny" style={{ color: "var(--warn)" }}>
                  {!settings.portfolio
                    ? !settings.full_name
                      ? "No name or portfolio link in Settings yet, so the draft is unsigned and the sentence offering your work has been left out rather than pointed at nothing."
                      : "No portfolio link in Settings yet, so the sentence offering your work has been left out rather than pointed at nothing."
                    : "No name in Settings yet, so the draft is unsigned."}{" "}
                  Add {[!settings.full_name && "your name", !settings.portfolio && "a portfolio URL"]
                    .filter(Boolean)
                    .join(" and ")}{" "}
                  in Settings and every draft fills itself in.
                </p>
              )}

              <div className="row wrap" style={{ gap: 7 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => flash("body", `${draft.subject}\n\n${draft.body}`)}
                >
                  {copied === "body" ? "Copied" : "Copy email"}
                </button>
                <a
                  className="btn btn-sm"
                  href={mailto(guessedEmail, draft.subject, draft.body)}
                >
                  Open in mail app
                </a>
              </div>
              <p className="tiny dimmer" style={{ marginTop: 10, marginBottom: 0 }}>
                Attachments cannot be added by a link, so attach your resume in the mail app.
                {settings.portfolio
                  ? " Your portfolio goes in as a URL, which is better anyway — it never bounces for size."
                  : ""}
              </p>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  )
}

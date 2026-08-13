import { useMemo, useState } from "react"
import type { Application, CompanyDossier, CompanyInfo, Contact, Job, Settings } from "@/lib/types"
import { ago, copy, logoFor, money, scoreClass } from "@/lib/format"
import { drafts, mailto, renderPattern } from "@/lib/email"
import { matchResume } from "@/lib/resume"
import { agenda, likelyQuestions, portfolioPlan } from "@/lib/prep"
import { vet } from "@/lib/vetting"

interface Props {
  job: Job
  company?: CompanyInfo
  dossier?: CompanyDossier
  settings: Settings
  idf: Record<string, number>
  application?: Application
  contacts: Contact[]
  onApply: (job: Job) => void
  onStage: (job: Job, stage: Application["stage"]) => void
  onAddContact: (seed: Partial<Contact>) => void
  onOpenSettings: () => void
  onClose: () => void
}

type Tab = "role" | "match" | "people" | "write" | "prep"

export function JobDetail({
  job,
  company,
  dossier,
  settings,
  idf,
  application,
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

  const vetting = useMemo(() => vet(job, dossier), [job, dossier])

  const match = useMemo(
    () => (settings.resume_text ? matchResume(settings.resume_text, job, idf) : null),
    [settings.resume_text, job, idf],
  )

  const allDrafts = useMemo(
    () => drafts(job, settings, idf, person.first || "there"),
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

        <h1>{job.title}</h1>

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
          <span className="pill dim">{ago(job.posted_at)}</span>
        </div>

        <div className="row" style={{ marginTop: 12, gap: 7 }}>
          <button className="btn btn-primary" onClick={() => onApply(job)}>
            Open &amp; track application →
          </button>
          {application ? (
            <select
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
        <div className="tabs">
          {(
            [
              ["role", "The role"],
              ["match", match ? `Resume ${match.score}` : "Resume"],
              ["people", "Who to contact"],
              ["write", "Write to them"],
              ["prep", "Prepare"],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <button key={key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>

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
              <h3>Why this ranks {job.match_score}</h3>
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
                  Paste your resume once in Settings and every job on the board gets scored against
                  it. It stays in this browser — it is never uploaded anywhere.
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

                  {match.missing.length > 0 && (
                    <div className="card">
                      <h3>Missing, most damaging first</h3>
                      <p className="tiny dimmer" style={{ marginTop: -4 }}>
                        Ranked by how rare each term is across all {Object.keys(idf).length} terms
                        on the board. A rare term is a real requirement; a common one is filler.
                      </p>
                      <div className="wrap">
                        {match.missing.slice(0, 18).map((gap) => (
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
              <h3>Work out their email</h3>
              {domain ? (
                <>
                  <div className="split" style={{ marginBottom: 10 }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Their first name</label>
                      <input
                        type="text"
                        value={person.first}
                        placeholder="e.g. Ananya"
                        onChange={(e) => setPerson((p) => ({ ...p, first: e.target.value }))}
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Last name</label>
                      <input
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
                  type="text"
                  value={person.first}
                  placeholder="Leave blank for a neutral greeting"
                  onChange={(e) => setPerson((p) => ({ ...p, first: e.target.value }))}
                />
              </div>

              <div className="field">
                <label>Subject</label>
                <input type="text" readOnly value={draft.subject} />
              </div>

              <div className="field">
                <label>Body</label>
                <textarea readOnly rows={17} value={draft.body} />
              </div>

              {!settings.full_name && (
                <p className="tiny" style={{ color: "var(--warn)" }}>
                  Add your name and portfolio in Settings and these drafts fill themselves in.
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
                Attachments cannot be added by a link, so attach your resume in the mail app. Your
                portfolio goes in as a URL, which is better anyway — it never bounces for size.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

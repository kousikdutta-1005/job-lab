import { useState } from "react"
import { ago, inr } from "@/lib/format"

/* The advisor files carry rich structured evidence — companies with their open
   roles, terms with the postings that use them, pay bands with their source.
   Rendering that as text threw all of it away and printed "[object Object]"
   under every insight. It is rendered properly here, with the job links intact,
   so a piece of advice is also the way to act on it. */

interface RoleRef {
  title: string
  company?: string
  seniority?: string
  location?: string
  url?: string
}

interface EvidenceCompany {
  company: string
  open_roles: number
  roles?: RoleRef[]
}

interface EvidenceTerm {
  term: string
  senior_jobs?: number
  share?: number
  leverage?: number
  mid_jobs?: number
  jobs?: number
  lift?: number
  idf?: number
  examples?: RoleRef[]
}

export interface Insight {
  headline: string
  body: string
  evidence?: unknown
  confidence?: string
  kind?: string
}

export interface NewsItem {
  title: string
  url: string
  source: string
  published?: string
  summary?: string
  tags?: string[]
}

interface City {
  city: string
  country?: string
  jobs?: number
  salary_samples?: number
  nominal_median_pay_inr?: number
  ppp_adjusted_vs_bengaluru_pct?: number
  expected_uplift_pct?: number | null
  visa_attainability?: number
  visa_difficulty_label?: string
  effective_tax_rate?: number
  visa_difficulty?: string
  visa_note?: string
  tax_note?: string
  verdict?: string
  baseline_basis?: unknown
  pay_basis?: { tier?: number; kind?: string; samples?: number }
}

export interface Advisor {
  insights?: { generated_at: string; insights: Insight[] }
  news?: { generated_at: string; items: NewsItem[]; sources: unknown[] }
  trends?: {
    generated_at: string
    history_days: number
    latest: Record<string, unknown>
    comparisons: Record<string, unknown>
  }
  relocation?: {
    generated_at: string
    baseline: unknown
    cities: City[]
    comparable_band_pct?: number
  }
}

const CONFIDENCE_CLASS: Record<string, string> = {
  high: "pill-good",
  medium: "pill-warn",
  low: "",
}

const VISA_CLASS: Record<string, string> = {
  very_high: "pill-bad",
  high: "pill-bad",
  medium: "pill-warn",
  low: "pill-good",
  none: "pill-good",
}

function RoleLinks({ roles }: { roles: RoleRef[] }) {
  return (
    <div className="link-list" style={{ marginTop: 6 }}>
      {roles.slice(0, 6).map((role, index) => (
        <a
          key={`${role.url ?? role.title}-${index}`}
          className="link-row"
          href={role.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>{role.title}</span>
          <span className="dimmer tiny">
            {[role.company, role.location].filter(Boolean).join(" · ")}
          </span>
        </a>
      ))}
    </div>
  )
}

function Evidence({ evidence }: { evidence: unknown }) {
  if (!Array.isArray(evidence) || evidence.length === 0) return null

  const first = evidence[0] as Record<string, unknown>

  if (typeof first === "string") {
    return (
      <ul className="reasons">
        {(evidence as string[]).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    )
  }

  if ("company" in first) {
    return (
      <>
        {(evidence as EvidenceCompany[]).map((row) => (
          <div key={row.company} style={{ marginBottom: 12 }}>
            <div className="row" style={{ marginBottom: 2 }}>
              <span style={{ fontWeight: 560 }}>{row.company}</span>
              <span className="pill pill-accent">{row.open_roles} open</span>
            </div>
            {row.roles && row.roles.length > 0 && <RoleLinks roles={row.roles} />}
          </div>
        ))}
      </>
    )
  }

  if ("term" in first) {
    return (
      <>
        {(evidence as EvidenceTerm[]).map((row) => (
          <div key={row.term} style={{ marginBottom: 12 }}>
            <div className="row wrap" style={{ marginBottom: 2 }}>
              <span style={{ fontWeight: 560 }}>{row.term}</span>
              {row.lift !== undefined && <span className="pill pill-accent">{row.lift}× senior</span>}
              {row.senior_jobs !== undefined && (
                <span className="dimmer tiny">
                  {row.senior_jobs} senior
                  {row.mid_jobs !== undefined ? ` · ${row.mid_jobs} mid` : ""}
                </span>
              )}
              {row.jobs !== undefined && <span className="dimmer tiny">{row.jobs} jobs</span>}
              {row.idf !== undefined && (
                <span className="dimmer tiny">
                  {row.share !== undefined
                    ? `${Math.round(row.share * 100)}% of the senior roles you can take`
                    : `rarity ${Number(row.idf).toFixed(2)}`}
                </span>
              )}
            </div>
            {row.examples && row.examples.length > 0 && <RoleLinks roles={row.examples} />}
          </div>
        ))}
      </>
    )
  }

  return (
    <ul className="reasons">
      {(evidence as unknown[]).slice(0, 8).map((row, index) => (
        <li key={index}>{JSON.stringify(row)}</li>
      ))}
    </ul>
  )
}

export function AdvisorView({ advisor }: { advisor: Advisor }) {
  const [tab, setTab] = useState<"advice" | "move" | "news" | "trends">("advice")

  const insights = advisor.insights?.insights ?? []
  const news = advisor.news?.items ?? []
  const cities = advisor.relocation?.cities ?? []
  // Same band the verdict prose uses, so a card cannot call a gap "roughly
  // comparable" while colouring it red beside the sentence.
  const band = advisor.relocation?.comparable_band_pct ?? 15
  const trends = advisor.trends

  return (
    <div className="pane">
      <div className="pane-inner pane-wide">
        <h2 className="title">Advisor</h2>
        <p className="subtitle">
          What the data says about your career, not what a model guessed. Every claim names the
          evidence it rests on, and declines to make the call when the evidence is thin.
        </p>

        <div className="tabs">
          {(
            [
              ["advice", `Advice ${insights.length ? `(${insights.length})` : ""}`],
              ["move", `Should I move? ${cities.length ? `(${cities.length})` : ""}`],
              ["news", `Industry ${news.length ? `(${news.length})` : ""}`],
              ["trends", "Trends"],
            ] as Array<[typeof tab, string]>
          ).map(([key, label]) => (
            <button key={key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>

        {tab === "advice" && (
          <>
            {insights.length === 0 && (
              <div className="empty">No advice generated yet. Run the nightly build.</div>
            )}
            {insights.map((insight) => (
              <div className="card" key={insight.headline}>
                <div className="row-between" style={{ alignItems: "flex-start" }}>
                  <h3 style={{ margin: 0 }}>{insight.headline}</h3>
                  {insight.confidence && (
                    <span className={`pill ${CONFIDENCE_CLASS[insight.confidence] ?? ""}`}>
                      {insight.confidence} confidence
                    </span>
                  )}
                </div>
                <p className="tiny" style={{ color: "var(--ink-2)", marginBottom: 12 }}>
                  {insight.body}
                </p>
                {Array.isArray(insight.evidence) && insight.evidence.length > 0 && (
                  <>
                    <div className="kicker">Based on</div>
                    <Evidence evidence={insight.evidence} />
                  </>
                )}
              </div>
            ))}
          </>
        )}

        {tab === "move" && (
          <>
            <div className="card">
              <h3>How to read this</h3>
              <p className="tiny dim" style={{ margin: 0 }}>
                Pay is adjusted for purchasing power, so the percentage is what the money actually
                buys rather than what it converts to. The order is the second number: real pay
                multiplied by roughly how likely the visa is, because a role paying double that
                needs a lottery you will probably not win is not a better job. A pay cut is never
                discounted that way — not getting the visa cannot rescue it.
              </p>
            </div>

            {cities.length === 0 && <div className="empty">No relocation data yet.</div>}

            {cities.map((city) => {
              const delta = city.ppp_adjusted_vs_bengaluru_pct
              const expected = city.expected_uplift_pct
              const discounted =
                delta !== undefined && delta !== null &&
                expected !== undefined && expected !== null &&
                Math.round(expected) !== Math.round(delta)
              return (
                <div className="card" key={city.city}>
                  <div className="row-between" style={{ marginBottom: 6 }}>
                    <h3 style={{ margin: 0 }}>
                      {city.city} <span className="dimmer tiny">{city.country}</span>
                    </h3>
                    <div className="row" style={{ gap: 6 }}>
                      {delta !== undefined && delta !== null && (
                        <span
                          className={`pill ${delta > band ? "pill-good" : delta < -band ? "pill-bad" : ""}`}
                        >
                          {delta > 0 ? "+" : ""}
                          {Math.round(delta)}% real pay
                        </span>
                      )}
                      {discounted && (
                        <span className="pill" title="Real pay discounted by how likely the visa is">
                          {expected! > 0 ? "+" : ""}
                          {Math.round(expected!)}% once the visa odds are counted
                        </span>
                      )}
                      {city.visa_difficulty && (
                        <span className={`pill ${VISA_CLASS[city.visa_difficulty] ?? ""}`}>
                          {city.visa_difficulty === "home"
                            ? "no visa needed"
                            : `visa ${city.visa_difficulty_label ?? city.visa_difficulty.replace("_", " ")}`}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="tiny" style={{ color: "var(--ink-2)", margin: "0 0 8px" }}>
                    {city.verdict}
                  </p>

                  <div className="row wrap tiny dimmer" style={{ gap: 12 }}>
                    {city.jobs !== undefined && (
                      <span>
                        {city.jobs} open design {city.jobs === 1 ? "role" : "roles"}
                      </span>
                    )}
                    {city.nominal_median_pay_inr ? (
                      <span>
                        median {inr(city.nominal_median_pay_inr)} nominal{" "}
                        {/* Where the median came from. Printed next to a role count
                            it reads as the median of those roles, and for a city
                            like Dallas -- one open role, zero disclosed bands --
                            it is the published benchmark instead. */}
                        {city.pay_basis?.kind === "crawled_disclosed_bands"
                          ? `from ${city.pay_basis.samples} disclosed ${
                              city.pay_basis.samples === 1 ? "band" : "bands"
                            }`
                          : "from the published benchmark, not from these postings"}
                      </span>
                    ) : null}
                    {city.effective_tax_rate !== undefined && (
                      <span>
                        ~{Math.round(city.effective_tax_rate * 100)}% effective tax, country-wide
                      </span>
                    )}
                  </div>
                  {city.tax_note && (
                    <p className="tiny dimmer" style={{ margin: "6px 0 0" }}>
                      {city.tax_note}
                    </p>
                  )}

                  {city.visa_note && (
                    <p className="tiny dimmer" style={{ margin: "8px 0 0" }}>
                      {city.visa_note}
                    </p>
                  )}
                </div>
              )
            })}
          </>
        )}

        {tab === "news" && (
          <>
            {news.length === 0 && <div className="empty">No news fetched yet.</div>}
            {news.length > 0 && (
              <table className="data">
                <thead>
                  <tr>
                    <th>Story</th>
                    <th>Source</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {news.slice(0, 50).map((item) => (
                    <tr key={item.url}>
                      <td>
                        <a href={item.url} target="_blank" rel="noopener noreferrer">
                          {item.title}
                        </a>
                        {item.tags && item.tags.length > 0 && (
                          <div className="wrap" style={{ marginTop: 4 }}>
                            {item.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="pill tiny">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="tiny dim">{item.source}</td>
                      <td className="tiny dimmer">{ago(item.published?.slice(0, 10))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {tab === "trends" && (
          <div className="card">
            <h3>Market movement</h3>
            {trends && trends.history_days > 1 && allWaiting(trends.comparisons) && (
              <p className="tiny dim" style={{ margin: "0 0 10px" }}>
                {trends.history_days} nightly snapshots so far. The first window needs about seven,
                so the dashes below mean “not measured yet”, not “nothing moved”. Roughly{" "}
                {Math.max(1, 7 - trends.history_days)} more{" "}
                {7 - trends.history_days === 1 ? "night" : "nights"} until the 7-day row fills in.
              </p>
            )}
            {!trends || trends.history_days <= 1 ? (
              <p className="tiny dim" style={{ margin: 0 }}>
                Only {trends?.history_days ?? 0} day of history so far. Trends need at least a week
                of nightly snapshots before any claim about the market heating or cooling would
                mean anything, so nothing is claimed yet. The snapshots are committed each night —
                this page fills itself in.
              </p>
            ) : (
              <TrendTable comparisons={trends.comparisons} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function allWaiting(comparisons: Record<string, unknown>): boolean {
  const rows = Object.values(comparisons).filter(
    (v): v is Record<string, unknown> => !!v && typeof v === "object",
  )
  return rows.length > 0 && rows.every((r) => r.status === "not_enough_history")
}

function TrendTable({ comparisons }: { comparisons: Record<string, unknown> }) {
  const rows = Object.entries(comparisons).filter(
    ([, value]) => value && typeof value === "object",
  ) as Array<[string, Record<string, unknown>]>

  if (rows.length === 0) {
    return (
      <p className="tiny dim" style={{ margin: 0 }}>
        No comparable snapshots yet.
      </p>
    )
  }

  return (
    <table className="data">
      <thead>
        <tr>
          <th>Window</th>
          <th>Jobs</th>
          <th>Eligible</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([window, value]) => {
          const waiting = value.status === "not_enough_history"
          const delta = (v: unknown) =>
            typeof v === "number" ? `${v > 0 ? "+" : ""}${v}` : "—"
          return (
            <tr key={window} className={waiting ? "dim" : undefined}>
              <td className="mono">{window}</td>
              <td className="mono tiny">{waiting ? "—" : delta(value.jobs_delta ?? value.jobs)}</td>
              <td className="mono tiny">
                {waiting ? "—" : delta(value.eligible_delta ?? value.eligible)}
              </td>
              <td className="tiny dim">
                {String(value.message ?? value.note ?? value.summary ?? "")}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

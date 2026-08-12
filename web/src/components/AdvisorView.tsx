import { useState } from "react"
import { ago } from "@/lib/format"

export interface Insight {
  headline: string
  body: string
  evidence?: string[] | string
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
    baseline: Record<string, unknown>
    cities: Array<Record<string, unknown>>
  }
}

const CONFIDENCE_CLASS: Record<string, string> = {
  high: "pill-good",
  medium: "pill-warn",
  low: "",
}

export function AdvisorView({ advisor }: { advisor: Advisor }) {
  const [tab, setTab] = useState<"advice" | "move" | "news" | "trends">("advice")

  const insights = advisor.insights?.insights ?? []
  const news = advisor.news?.items ?? []
  const cities = advisor.relocation?.cities ?? []
  const trends = advisor.trends

  return (
    <div className="pane">
      <div className="pane-inner pane-wide">
        <h2 className="title">Advisor</h2>
        <p className="subtitle">
          What the data says about your career, not what a model guessed. Every claim below names
          the evidence it rests on, and refuses to make the call when the evidence is thin.
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
            {insights.map((insight) => {
              const evidence = Array.isArray(insight.evidence)
                ? insight.evidence
                : insight.evidence
                  ? [insight.evidence]
                  : []
              return (
                <div className="card" key={insight.headline}>
                  <div className="row-between" style={{ alignItems: "flex-start" }}>
                    <h3 style={{ margin: 0 }}>{insight.headline}</h3>
                    {insight.confidence && (
                      <span className={`pill ${CONFIDENCE_CLASS[insight.confidence] ?? ""}`}>
                        {insight.confidence} confidence
                      </span>
                    )}
                  </div>
                  <p className="tiny" style={{ color: "var(--ink-2)", marginBottom: evidence.length ? 10 : 0 }}>
                    {insight.body}
                  </p>
                  {evidence.length > 0 && (
                    <>
                      <div className="kicker">Based on</div>
                      <ul className="reasons">
                        {evidence.map((line, index) => (
                          <li key={index}>{String(line)}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )
            })}
          </>
        )}

        {tab === "move" && (
          <>
            <div className="card">
              <h3>How to read this</h3>
              <p className="tiny dim" style={{ margin: 0 }}>
                Pay is adjusted by purchasing power, so a number here is what the money actually
                buys rather than what it converts to. Visa reality is weighted deliberately: a role
                paying double that needs a lottery you probably will not win is not a better job,
                and this page will not pretend otherwise.
              </p>
            </div>
            {cities.length === 0 && <div className="empty">No relocation data yet.</div>}
            {cities.map((city) => (
              <div className="card" key={String(city.city)}>
                <div className="row-between" style={{ marginBottom: 6 }}>
                  <h3 style={{ margin: 0 }}>
                    {String(city.city)}{" "}
                    <span className="dimmer tiny">{String(city.country ?? "")}</span>
                  </h3>
                  {city.visa != null && <span className="pill">{String(city.visa)}</span>}
                </div>
                <p className="tiny" style={{ color: "var(--ink-2)", margin: 0 }}>
                  {String(city.verdict ?? "")}
                </p>
              </div>
            ))}
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
            {!trends || trends.history_days <= 1 ? (
              <p className="tiny dim" style={{ margin: 0 }}>
                Only {trends?.history_days ?? 0} day of history so far. Trends need at least a week
                of nightly snapshots before any claim about the market heating or cooling would
                mean anything, so nothing is claimed yet. The snapshots are being committed each
                night — this page fills itself in.
              </p>
            ) : (
              <pre className="tiny mono" style={{ whiteSpace: "pre-wrap", color: "var(--ink-2)" }}>
                {JSON.stringify(trends.comparisons, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

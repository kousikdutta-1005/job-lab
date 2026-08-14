import type { Application, Contact, Job, Settings } from "@/lib/types"
import type { Action, ActionKind } from "@/lib/briefing"

interface Props {
  actions: Action[]
  jobs: Job[]
  applications: Application[]
  contacts: Contact[]
  settings: Settings
  generatedAt: string
  onGo: (action: Action) => void
}

const KIND_LABEL: Record<ActionKind, string> = {
  offer: "offer",
  interview: "interview",
  portfolio: "portfolio",
  funnel: "diagnosis",
  apply: "apply",
  follow_up: "chase",
  expiring: "decide",
  resume: "resume",
  profile: "setup",
  network: "network",
  nothing: "",
}

const KIND_CLASS: Record<ActionKind, string> = {
  offer: "pill-good",
  interview: "pill-accent",
  portfolio: "pill-warn",
  funnel: "pill-warn",
  apply: "pill-accent",
  follow_up: "pill-warn",
  expiring: "pill-bad",
  resume: "pill-accent",
  profile: "pill-warn",
  network: "",
  nothing: "",
}

// Every card on this feed differs only by a small pill in the corner —
// giving each kind's tone a left border too means the list can be scanned
// by color before a single word is read, the way the pill's own tone
// already promises but the card itself never delivered on.
const KIND_BORDER: Record<ActionKind, string> = {
  offer: "var(--good)",
  interview: "var(--accent)",
  portfolio: "var(--warn)",
  funnel: "var(--warn)",
  apply: "var(--accent)",
  follow_up: "var(--warn)",
  expiring: "var(--bad)",
  resume: "var(--accent)",
  profile: "var(--warn)",
  network: "var(--line)",
  nothing: "var(--line)",
}

const LABEL_FOR: Partial<Record<ActionKind, string>> = {
  offer: "Read the offer",
  interview: "Prepare",
  apply: "Open the role",
  expiring: "Open the role",
  follow_up: "Open applications",
  network: "Find someone",
  portfolio: "Check the portfolio",
  funnel: "See the funnel",
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return "Still up"
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

function daysSince(date?: string): number | null {
  if (!date) return null
  const n = Date.parse(date)
  if (!Number.isFinite(n)) return null
  return Math.floor((Date.now() - n) / 86_400_000)
}

export function TodayView({
  actions,
  jobs,
  applications,
  contacts,
  settings,
  generatedAt,
  onGo,
}: Props) {
  const eligible = jobs.filter((j) => j.eligible)
  const fresh = eligible.filter((j) => {
    if (!j.posted_at) return false
    return Date.now() - Date.parse(j.posted_at) < 3 * 86_400_000
  })
  const live = applications.filter((a) =>
    ["applied", "phone_screen", "interview", "offer"].includes(a.stage),
  )
  const touched = new Set(applications.map((a) => a.job_id).filter(Boolean) as string[])
  const nextApply = [...eligible]
    .filter((job) => !touched.has(job.id))
    .sort((a, b) => b.match_score - a.match_score)[0]
  const stale = applications.filter((app) => {
    if (!["applied", "phone_screen", "interview"].includes(app.stage)) return false
    const days = daysSince(app.follow_up_date ?? app.date_applied ?? app.date_saved)
    return days !== null && days >= 7
  })
  const topCity = [...eligible]
    .flatMap((job) => job.cities.slice(0, 1).map((city) => ({ city, score: job.match_score })))
    .reduce<Map<string, { count: number; best: number }>>((map, row) => {
      const current = map.get(row.city) ?? { count: 0, best: 0 }
      current.count += 1
      current.best = Math.max(current.best, row.score)
      map.set(row.city, current)
      return map
    }, new Map())
  const market = [...topCity.entries()].sort((a, b) => b[1].count - a[1].count || b[1].best - a[1].best)[0]
  const setupMissing = [
    !settings.resume_text.trim() && "resume",
    !settings.portfolio.trim() && "portfolio",
    !settings.full_name.trim() && "name",
    !settings.email.trim() && "email",
  ].filter(Boolean) as string[]

  const name = settings.full_name?.split(/\s+/)[0]

  return (
    <div className="pane">
      <div className="pane-inner">
        <h2 className="title">
          {greeting()}
          {name ? `, ${name}` : ""}.
        </h2>
        <p className="subtitle">
          {actions.length === 0
            ? "Nothing is waiting on you."
            : `${actions.length} ${actions.length === 1 ? "thing" : "things"} worth doing, hardest-hitting first.`}{" "}
          The board was rebuilt {generatedAt.slice(0, 10)} and found {eligible.length} roles you can
          take{fresh.length ? `, ${fresh.length} of them posted in the last three days` : ""}.
        </p>

        <div className="grid-3" style={{ marginBottom: 18 }}>
          <div className="stat">
            <div className="n">{eligible.length}</div>
            <div className="l">Roles you can take</div>
          </div>
          <div className="stat">
            <div className="n">{live.length}</div>
            <div className="l">Live applications</div>
          </div>
          <div className="stat">
            <div className="n">{contacts.length}</div>
            <div className="l">People you know</div>
          </div>
        </div>

        <div className="command-center">
          <div className="row-between" style={{ alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div className="kicker">Autopilot</div>
              <h3 style={{ margin: 0 }}>Highest-leverage next moves</h3>
            </div>
            <span className="pill pill-accent">decision layer</span>
          </div>
          <div className="command-grid">
            <button
              className="command-card"
              disabled={!nextApply}
              onClick={() =>
                nextApply &&
                onGo({
                  id: `next-${nextApply.id}`,
                  kind: "apply",
                  urgency: 90,
                  title: nextApply.title,
                  detail: "",
                  jobId: nextApply.id,
                  view: "board",
                })
              }
            >
              <span className="kicker">Apply next</span>
              <strong>{nextApply ? nextApply.title : "No untouched strong role"}</strong>
              <small>
                {nextApply
                  ? `${nextApply.company} · ${nextApply.match_score}/100 · ${nextApply.cities[0] ?? nextApply.workplace}`
                  : "Everything strong is already touched or filtered out."}
              </small>
            </button>

            <button
              className="command-card"
              onClick={() =>
                onGo({
                  id: "pipeline-health",
                  kind: "follow_up",
                  urgency: 80,
                  title: "Pipeline",
                  detail: "",
                  view: "tracker",
                })
              }
            >
              <span className="kicker">Pipeline brain</span>
              <strong>{stale.length ? `${stale.length} follow-up${stale.length === 1 ? "" : "s"} due` : `${live.length} live application${live.length === 1 ? "" : "s"}`}</strong>
              <small>
                {stale.length
                  ? `${stale[0].company} is the oldest unanswered thread.`
                  : "No tracked application is screaming for a chase."}
              </small>
            </button>

            <button
              className="command-card"
              onClick={() =>
                onGo({
                  id: "setup-readiness",
                  kind: "profile",
                  urgency: 75,
                  title: "Setup",
                  detail: "",
                  view: "settings",
                })
              }
            >
              <span className="kicker">Apply kit readiness</span>
              <strong>{setupMissing.length ? `Missing ${setupMissing.join(", ")}` : "Autofill basics ready"}</strong>
              <small>
                {setupMissing.length
                  ? "Fix once; every resume match, email draft and autofill gets better."
                  : "Resume, portfolio and identity fields are ready for automation."}
              </small>
            </button>

            <button
              className="command-card"
              disabled={!market}
              onClick={() =>
                market &&
                onGo({
                  id: `market-${market[0]}`,
                  kind: "network",
                  urgency: 70,
                  title: "Market",
                  detail: "",
                  jobIds: eligible.filter((job) => job.cities[0] === market[0]).map((job) => job.id),
                  setLabel: market[0],
                  view: "board",
                })
              }
            >
              <span className="kicker">Market focus</span>
              <strong>{market ? market[0] : "No city cluster"}</strong>
              <small>
                {market
                  ? `${market[1].count} roles here, best fit ${market[1].best}/100. Work this market first.`
                  : "Remote-only or no eligible locations in the current crawl."}
              </small>
            </button>

            <button
              className="command-card"
              onClick={() =>
                onGo({
                  id: "portfolio-proof",
                  kind: "portfolio",
                  urgency: 72,
                  title: "Portfolio",
                  detail: "",
                  view: "portfolio",
                })
              }
            >
              <span className="kicker">Portfolio matcher</span>
              <strong>{settings.portfolio.trim() ? "Proof link exists" : "Portfolio link missing"}</strong>
              <small>
                Match case studies against what the current board actually asks designers to prove.
              </small>
            </button>

            <button
              className="command-card"
              onClick={() =>
                onGo({
                  id: "learning-loop",
                  kind: "funnel",
                  urgency: 70,
                  title: "Learning loop",
                  detail: "",
                  view: "tracker",
                })
              }
            >
              <span className="kicker">Learning loop</span>
              <strong>{applications.length ? `${applications.length} tracked signals` : "Track applications"}</strong>
              <small>
                Diagnose whether the bottleneck is targeting, resume, portfolio, outreach or interviews.
              </small>
            </button>
          </div>
        </div>

        {actions.length === 0 && (
          <div className="card">
            <h3 style={{ margin: 0 }}>Nothing needs you today</h3>
            <p className="tiny" style={{ color: "var(--ink-2)", margin: "6px 0 0" }}>
              Every strong match is either applied to or deliberately skipped, and nothing is
              waiting on a follow-up. The crawl runs again tonight.
            </p>
          </div>
        )}

        {actions.map((action) => (
          <div
            className="card"
            key={action.id}
            style={{
              borderLeft: `3px solid ${KIND_BORDER[action.kind]}`,
              boxShadow:
                action.urgency >= 85
                  ? `inset 0 0 0 1px var(--line), 0 0 0 1px color-mix(in oklab, ${KIND_BORDER[action.kind]} 35%, transparent), var(--shadow-sm)`
                  : undefined,
            }}
          >
            <div className="row-between" style={{ alignItems: "flex-start", marginBottom: 5 }}>
              <h3 style={{ margin: 0 }}>{action.title}</h3>
              {action.kind !== "nothing" && (
                <span className={`pill ${KIND_CLASS[action.kind]}`}>{KIND_LABEL[action.kind]}</span>
              )}
            </div>

            <p className="tiny" style={{ color: "var(--ink-2)", margin: "0 0 10px" }}>
              {action.detail}
            </p>

            <div className="row-between">
              <span className="tiny dimmer">{action.evidence ?? ""}</span>
              {action.view && (
                <button className="btn btn-sm" onClick={() => onGo(action)}>
                  {action.jobIds?.length
                    ? `Show all ${action.jobIds.length}`
                    : LABEL_FOR[action.kind] ?? "Fix it"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

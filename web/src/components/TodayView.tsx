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
  apply: "apply",
  follow_up: "chase",
  expiring: "going cold",
  resume: "resume",
  profile: "setup",
  network: "network",
  nothing: "",
}

const KIND_CLASS: Record<ActionKind, string> = {
  offer: "pill-good",
  interview: "pill-accent",
  apply: "pill-accent",
  follow_up: "pill-warn",
  expiring: "pill-bad",
  resume: "pill-accent",
  profile: "pill-warn",
  network: "",
  nothing: "",
}

const LABEL_FOR: Partial<Record<ActionKind, string>> = {
  offer: "Read the offer",
  interview: "Prepare",
  apply: "Open the role",
  expiring: "Open the role",
  follow_up: "Open applications",
  network: "Find someone",
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return "Still up"
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
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
            style={
              action.urgency >= 85
                ? { borderLeft: "2px solid var(--accent)" }
                : undefined
            }
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
                  {LABEL_FOR[action.kind] ?? "Fix it"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

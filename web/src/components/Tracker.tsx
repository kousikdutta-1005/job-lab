import { Fragment, useMemo, useState } from "react"
import type { Application, Contact, Stage } from "@/lib/types"
import { STAGES, today, uid } from "@/lib/store"
import { ago, inr, logoFor } from "@/lib/format"

interface Props {
  applications: Application[]
  contacts: Contact[]
  onChange: (rows: Application[]) => void
  onOpenJob: (jobId: string) => void
}

const ACTIVE: Stage[] = ["wishlist", "applied", "phone_screen", "interview", "offer"]

/* Furthest along first — an offer at the bottom of the page is a design bug. */
const RANK: Record<Stage, number> = {
  offer: 6,
  interview: 5,
  phone_screen: 4,
  applied: 3,
  wishlist: 2,
  accepted: 1,
  rejected: 0,
  withdrawn: 0,
  archived: 0,
}
const stageRank = (stage: Stage): number => RANK[stage] ?? 0

const lastTouch = (row: Application): number => {
  const marks = [row.date_applied, row.date_saved, ...row.activities.map((a) => a.date)].filter(
    Boolean,
  ) as string[]
  const times = marks.map((d) => Date.parse(d)).filter((n) => Number.isFinite(n))
  return times.length ? Math.max(...times) : 0
}

export function Tracker({ applications, contacts, onChange, onOpenJob }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ title: "", company: "", url: "", location: "" })

  const rows = useMemo(
    () =>
      applications
        .filter((a) => (showClosed ? true : !["rejected", "withdrawn", "archived"].includes(a.stage)))
        .slice()
        // Whatever has moved most recently is what you are actually thinking
        // about. Insertion order is meaningless after the third application.
        .sort((a, b) => stageRank(b.stage) - stageRank(a.stage) || lastTouch(b) - lastTouch(a)),
    [applications, showClosed],
  )

  /* How long this has sat where it is. It is the number that tells you a thing
     is dead without anyone ever writing to say so. */
  function stalledDays(row: Application): number | null {
    const marks = [row.date_applied, ...row.activities.map((a) => a.date)].filter(
      Boolean,
    ) as string[]
    if (!marks.length) return null
    const latest = marks.map((d) => Date.parse(d)).sort((a, b) => b - a)[0]
    if (!Number.isFinite(latest)) return null
    return Math.floor((Date.now() - latest) / 86_400_000)
  }

  function addManual() {
    if (!draft.title.trim() || !draft.company.trim()) return
    const row: Application = {
      id: uid(),
      job_id: null,
      title: draft.title.trim(),
      company: draft.company.trim(),
      url: draft.url.trim(),
      location: draft.location.trim(),
      work_mode: "unknown",
      stage: "applied",
      date_saved: today(),
      date_applied: today(),
      contact_ids: [],
      activities: [{ id: uid(), type: "applied", date: today(), title: "Added by hand" }],
    }
    onChange([row, ...applications])
    setDraft({ title: "", company: "", url: "", location: "" })
    setAdding(false)
  }

  // A follow-up is due when a week has passed since you applied and nothing has
  // moved. That single number is the difference between a tracker and a to-do
  // list that quietly rots.
  const needsFollowUp = useMemo(
    () =>
      applications.filter((a) => {
        if (a.stage !== "applied" || !a.date_applied) return false
        const days = Math.floor((Date.now() - Date.parse(a.date_applied)) / 86_400_000)
        const chased = a.activities.some((x) => x.type === "email_sent")
        return days >= 7 && days <= 45 && !chased
      }),
    [applications],
  )

  function update(id: string, patch: Partial<Application>) {
    onChange(applications.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  function logActivity(id: string, type: Application["activities"][number]["type"], title: string) {
    onChange(
      applications.map((a) =>
        a.id === id
          ? {
              ...a,
              activities: [{ id: uid(), type, date: today(), title }, ...a.activities],
            }
          : a,
      ),
    )
  }

  function remove(id: string) {
    onChange(applications.filter((a) => a.id !== id))
    setOpenId(null)
  }

  const stats = {
    total: applications.length,
    applied: applications.filter((a) => a.date_applied).length,
    live: applications.filter((a) => ACTIVE.includes(a.stage)).length,
    interviews: applications.filter((a) =>
      ["interview", "offer", "accepted"].includes(a.stage),
    ).length,
    rejected: applications.filter((a) => a.stage === "rejected").length,
  }
  const rate = stats.applied ? Math.round((stats.interviews / stats.applied) * 100) : 0

  /* The detail lives directly under the row you clicked, not at the foot of
     the table — with twenty applications the old placement meant clicking a
     row and watching nothing appear to happen. */
  function detailFor(open: Application) {
    return (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="row-between">
              <h3 style={{ margin: 0 }}>
                {open.title} · <span className="dim">{open.company}</span>
              </h3>
              <a href={open.url} target="_blank" rel="noopener noreferrer" className="tiny">
                posting →
              </a>
            </div>

            <div className="split" style={{ marginTop: 12 }}>
              <div className="field">
                <label>Date applied</label>
                <input
                  type="date"
                  value={open.date_applied ?? ""}
                  onChange={(e) => update(open.id, { date_applied: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Follow up on</label>
                <input
                  type="date"
                  value={open.follow_up_date ?? ""}
                  onChange={(e) => update(open.id, { follow_up_date: e.target.value })}
                />
              </div>
            </div>

            <div className="field">
              <label>Notes</label>
              <textarea
                rows={4}
                value={open.notes ?? ""}
                placeholder="Who you spoke to, what they asked, what you promised to send…"
                onChange={(e) => update(open.id, { notes: e.target.value })}
              />
            </div>

            <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
              {(
                [
                  ["email_sent", "Logged email"],
                  ["call_made", "Logged call"],
                  ["interview", "Logged interview"],
                  ["note", "Note"],
                ] as Array<[Application["activities"][number]["type"], string]>
              ).map(([type, label]) => (
                <button key={type} className="chip" onClick={() => logActivity(open.id, type, label)}>
                  + {label}
                </button>
              ))}
            </div>

            {(() => {
              const known = contacts.filter(
                (c) => c.company.toLowerCase().trim() === open.company.toLowerCase().trim(),
              )
              return (
                <>
                  <div className="kicker">Who you know there</div>
                  {known.length === 0 ? (
                    <p className="tiny dimmer" style={{ margin: "0 0 12px" }}>
                      Nobody saved at {open.company}. An application with a name attached to it is a
                      different application; the LinkedIn searches on the posting are the fastest
                      way to find one.
                    </p>
                  ) : (
                    <div className="link-list" style={{ marginBottom: 12 }}>
                      {known.map((c) => (
                        <div key={c.id} className="link-row">
                          <div>
                            <span style={{ fontWeight: 550 }}>{c.name}</span>
                            <span className="dim tiny dot-sep">{c.title}</span>
                          </div>
                          <div className="row" style={{ gap: 8 }}>
                            {c.email && (
                              <a href={`mailto:${c.email}`} className="tiny">
                                email
                              </a>
                            )}
                            {c.linkedin_url && (
                              <a
                                href={c.linkedin_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="tiny"
                              >
                                LinkedIn
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )
            })()}

            {open.activities.length > 0 && (
              <>
                <div className="kicker">History</div>
                <div className="link-list">
                  {open.activities.map((activity) => (
                    <div key={activity.id} className="link-row">
                      <span>{activity.title}</span>
                      <span className="dimmer tiny mono">{activity.date}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <button
              className="chip"
              style={{ marginTop: 12, color: "var(--bad)" }}
              onClick={() => remove(open.id)}
            >
              Delete this application
            </button>
          </div>
    )
  }

  return (
    <div className="pane">
      <div className="pane-inner pane-wide">
        <h2 className="title">Applications</h2>
        <p className="subtitle">
          Every role you have touched, and what it is waiting on. Stored in this browser only —
          export a backup from Settings.
        </p>

        <div className="grid-3" style={{ marginBottom: 16 }}>
          <div className="stat">
            <div className="n">{stats.applied}</div>
            <div className="l">Applied</div>
          </div>
          <div className="stat">
            <div className="n">{stats.live}</div>
            <div className="l">Still live</div>
          </div>
          <div className="stat">
            <div className="n">{rate}%</div>
            <div className="l">Reached interview</div>
            <div className="sub">
              {stats.applied < 10
                ? "Too few applications to read anything into this yet."
                : rate >= 15
                  ? "Above the usual 8–12%. Your targeting is working."
                  : "Below the usual 8–12%. Tighten targeting before sending more."}
            </div>
          </div>
        </div>

        {needsFollowUp.length > 0 && (
          <div className="card" style={{ borderLeft: "2px solid var(--accent)" }}>
            <h3>
              {needsFollowUp.length} {needsFollowUp.length === 1 ? "application needs" : "applications need"}{" "}
              a follow-up
            </h3>
            <p className="tiny dimmer" style={{ marginTop: -4 }}>
              A week or more since you applied, with no chaser sent. One polite follow-up is
              expected; two is not.
            </p>
            <div className="link-list">
              {needsFollowUp.slice(0, 6).map((row) => (
                <div key={row.id} className="link-row">
                  <div>
                    <span style={{ fontWeight: 550 }}>{row.title}</span>
                    <span className="dim tiny dot-sep">{row.company}</span>
                  </div>
                  <div className="row">
                    <span className="dimmer tiny">applied {ago(row.date_applied)}</span>
                    <button
                      className="chip"
                      onClick={() => logActivity(row.id, "email_sent", "Follow-up sent")}
                    >
                      mark chased
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="row-between" style={{ marginBottom: 10 }}>
          <div className="kicker" style={{ margin: 0 }}>
            Pipeline
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="chip" onClick={() => setAdding((v) => !v)}>
              {adding ? "cancel" : "+ add by hand"}
            </button>
            <button className="chip" onClick={() => setShowClosed((v) => !v)}>
              {showClosed ? "hide closed" : "show closed"}
            </button>
          </div>
        </div>

        {adding && (
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Something you applied to elsewhere</h3>
            <p className="tiny dimmer" style={{ marginTop: -4 }}>
              Referrals, LinkedIn Easy Apply, a role a friend sent you — the board will never see
              these, and a tracker that only knows half your applications is worse than none.
            </p>
            <div className="split">
              <div className="field">
                <label>Role</label>
                <input
                  value={draft.title}
                  placeholder="Senior Product Designer"
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Company</label>
                <input
                  value={draft.company}
                  placeholder="Adobe"
                  onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                />
              </div>
            </div>
            <div className="split">
              <div className="field">
                <label>Link to the posting</label>
                <input
                  value={draft.url}
                  placeholder="https://…"
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Location</label>
                <input
                  value={draft.location}
                  placeholder="Bengaluru, India"
                  onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                />
              </div>
            </div>
            <button
              className="btn btn-sm"
              disabled={!draft.title.trim() || !draft.company.trim()}
              onClick={addManual}
            >
              Track it
            </button>
          </div>
        )}

        {applications.length === 0 ? (
          <div className="empty">
            Nothing tracked yet.
            <br />
            Open a role on the board and hit “Open &amp; track application”.
          </div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Role</th>
                <th>Stage</th>
                <th>Quiet for</th>
                <th>Pay</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const logo = logoFor(row.company_domain)
                const isOpen = openId === row.id
                return (
                  <Fragment key={row.id}>
                  <tr
                    className={isOpen ? "row-open" : "row-click"}
                    onClick={(e) => {
                      // Let the stage dropdown and the buttons do their own job.
                      const el = e.target as HTMLElement
                      if (el.closest("select, button, a, input")) return
                      setOpenId(isOpen ? null : row.id)
                    }}
                  >
                    <td>
                      <div className="row" style={{ gap: 7 }}>
                        {logo && (
                          <img
                            src={logo}
                            alt=""
                            width={14}
                            height={14}
                            style={{ borderRadius: 3 }}
                            onError={(e) => {
                              ;(e.currentTarget as HTMLImageElement).style.display = "none"
                            }}
                          />
                        )}
                        <div>
                          <div style={{ color: "var(--ink)", fontWeight: 520 }}>{row.title}</div>
                          <div className="tiny dimmer">
                            {row.company} · {row.location || row.work_mode}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        value={row.stage}
                        onChange={(e) => update(row.id, { stage: e.target.value as Stage })}
                        style={{ width: "auto", padding: "4px 7px", fontSize: 12 }}
                      >
                        {STAGES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="tiny">
                      {(() => {
                        const quiet = stalledDays(row)
                        if (quiet === null) return <span className="dimmer">not applied yet</span>
                        const dead = quiet >= 30 && !["offer", "accepted"].includes(row.stage)
                        return (
                          <span
                            className="mono"
                            style={{ color: dead ? "var(--bad)" : quiet >= 14 ? "var(--warn)" : undefined }}
                            title={row.date_applied ? `Applied ${ago(row.date_applied)}` : undefined}
                          >
                            {quiet === 0 ? "today" : `${quiet}d`}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="tiny mono">
                      {row.salary_min ? `${inr(row.salary_min)}–${inr(row.salary_max ?? 0)}` : "—"}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <button className="chip" onClick={() => setOpenId(isOpen ? null : row.id)}>
                          {isOpen ? "close" : "open"}
                        </button>
                        {row.job_id && (
                          <button className="chip" onClick={() => onOpenJob(row.job_id!)}>
                            posting
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="row-detail">
                      <td colSpan={5}>{detailFor(row)}</td>
                    </tr>
                  )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}

      </div>
    </div>
  )
}

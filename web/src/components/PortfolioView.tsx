import { useMemo, useState } from "react"
import type { Job } from "@/lib/types"
import { audit, criteria, type Project } from "@/lib/portfolio"
import { uid } from "@/lib/store"

interface Props {
  jobs: Job[]
  projects: Project[]
  onChange: (rows: Project[]) => void
}

export function PortfolioView({ jobs, projects, onChange }: Props) {
  const [openId, setOpenId] = useState<string | null>(projects[0]?.id ?? null)

  const list = useMemo(() => criteria(jobs), [jobs])
  const result = useMemo(() => audit(projects, list), [projects, list])

  function add() {
    const project: Project = { id: uid(), name: "", url: "", met: {} }
    onChange([...projects, project])
    setOpenId(project.id)
  }

  function update(id: string, patch: Partial<Project>) {
    onChange(projects.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  function toggle(id: string, key: string) {
    const project = projects.find((p) => p.id === id)
    if (!project) return
    update(id, { met: { ...project.met, [key]: !project.met[key] } })
  }

  const open = projects.find((p) => p.id === openId) ?? null
  const eligible = jobs.filter((j) => j.eligible).length

  return (
    <div className="pane">
      <div className="pane-inner">
        <h2 className="title">Portfolio</h2>
        <p className="subtitle">
          Every tool in this category optimises the resume, because a resume is text and text is
          easy to score. For a design role the resume gets six seconds and the portfolio gets the
          decision. This checks your case studies against what the {eligible} roles you can take
          are actually asking for — the weight on each line below is counted from their postings,
          not asserted.
        </p>

        <div className="card">
          <div className="row-between">
            <h3 style={{ margin: 0 }}>What the board asks for</h3>
            {projects.length > 0 && (
              <span className="tiny mono dimmer">
                {Math.round(result.coverage * 100)}% covered, weighted by demand
              </span>
            )}
          </div>
          <p className="tiny" style={{ color: "var(--ink-2)", marginTop: 6 }}>
            {result.verdict}
          </p>

          <div style={{ marginTop: 12 }}>
            {result.gaps.length > 0
              ? result.gaps.map((gap) => (
                  <div key={gap.criterion.key} style={{ marginBottom: 10 }}>
                    <div className="row-between" style={{ marginBottom: 3 }}>
                      <span className="tiny" style={{ color: "var(--ink-2)" }}>
                        {gap.criterion.label}
                        {gap.covered === 0 && (
                          <span className="pill pill-bad tiny" style={{ marginLeft: 8 }}>
                            in none of your work
                          </span>
                        )}
                        {gap.covered === 1 && projects.length > 1 && (
                          <span className="pill pill-warn tiny" style={{ marginLeft: 8 }}>
                            only one project
                          </span>
                        )}
                      </span>
                      <span className="tiny mono dimmer">
                        {Math.round(gap.criterion.demand * 100)}% of roles you can take ·{" "}
                        {gap.covered}/{projects.length} projects
                      </span>
                    </div>
                    <div
                      style={{
                        height: 5,
                        borderRadius: 3,
                        background: "var(--bg-hover)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.round(gap.criterion.demand * 100)}%`,
                          background: gap.covered === 0 ? "var(--bad)" : "var(--accent)",
                          opacity: gap.covered === 0 ? 0.8 : 0.45,
                        }}
                      />
                    </div>
                    <p className="tiny dimmer" style={{ margin: "4px 0 0" }}>
                      {gap.criterion.asks}
                    </p>
                  </div>
                ))
              : list.map((c) => (
                  <div key={c.key} className="link-row">
                    <div>
                      <span style={{ fontWeight: 550 }}>{c.label}</span>
                      <span className="dim tiny dot-sep">{c.asks}</span>
                    </div>
                    <span className="tiny mono dimmer">{Math.round(c.demand * 100)}%</span>
                  </div>
                ))}
          </div>
        </div>

        <div className="row-between" style={{ margin: "14px 0 10px" }}>
          <div className="kicker" style={{ margin: 0 }}>
            Your case studies
          </div>
          <button className="chip" onClick={add}>
            + add a project
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="empty">
            No case studies added yet.
            <br />
            Add the three you actually send people — the third one is the one nobody prepares.
          </div>
        ) : (
          <div className="link-list">
            {projects.map((project) => {
              const score = list.reduce((s, c) => s + (project.met[c.key] ? c.demand : 0), 0)
              const total = list.reduce((s, c) => s + c.demand, 0)
              const isOpen = project.id === openId
              return (
                <div key={project.id}>
                  <div className="link-row" style={{ cursor: "pointer" }}>
                    <div onClick={() => setOpenId(isOpen ? null : project.id)} style={{ flex: 1 }}>
                      <span style={{ fontWeight: 550 }}>{project.name || "Untitled project"}</span>
                      {project.id === result.strongest?.id && projects.length > 1 && (
                        <span className="pill pill-good tiny" style={{ marginLeft: 8 }}>
                          strongest
                        </span>
                      )}
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="tiny mono dimmer">
                        {total ? Math.round((score / total) * 100) : 0}%
                      </span>
                      <button
                        className="chip"
                        onClick={() => setOpenId(isOpen ? null : project.id)}
                      >
                        {isOpen ? "close" : "open"}
                      </button>
                      <button
                        className="chip"
                        style={{ color: "var(--bad)" }}
                        onClick={() => onChange(projects.filter((p) => p.id !== project.id))}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {isOpen && open && (
                    <div className="card" style={{ margin: "8px 0 12px" }}>
                      <div className="split">
                        <div className="field">
                          <label>Name</label>
                          <input
                            value={open.name}
                            placeholder="Rebuilding checkout at …"
                            onChange={(e) => update(open.id, { name: e.target.value })}
                          />
                        </div>
                        <div className="field">
                          <label>Link</label>
                          <input
                            value={open.url}
                            placeholder="https://…"
                            onChange={(e) => update(open.id, { url: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="kicker">Be honest — nobody else reads this</div>
                      <div style={{ marginTop: 4 }}>
                        {list.map((c) => (
                          <label
                            key={c.key}
                            className="link-row"
                            style={{ cursor: "pointer", alignItems: "flex-start" }}
                          >
                            <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                              <input
                                type="checkbox"
                                checked={!!open.met[c.key]}
                                onChange={() => toggle(open.id, c.key)}
                                style={{ width: "auto", marginTop: 3 }}
                              />
                              <div>
                                <div style={{ color: "var(--ink)" }}>{c.label}</div>
                                <div className="tiny dimmer">{c.asks}</div>
                              </div>
                            </div>
                            <span className="tiny mono dimmer" style={{ whiteSpace: "nowrap" }}>
                              {Math.round(c.demand * 100)}%
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

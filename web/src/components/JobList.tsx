import type { Application, Job } from "@/lib/types"
import { ago, logoFor, scoreClass } from "@/lib/format"

interface Props {
  jobs: Job[]
  all: Job[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  query: string
  onQuery: (value: string) => void
  eligibleOnly: boolean
  onEligibleOnly: (value: boolean) => void
  seniority: string | null
  onSeniority: (value: string | null) => void
  place: string | null
  onClearPlace: () => void
  appByJob: Map<string, Application>
}

const LEVELS: Array<[string, string]> = [
  ["senior", "Senior"],
  ["mid", "Mid"],
  ["lead", "Lead"],
  ["staff", "Staff"],
  ["manager", "Manager"],
  ["head", "Head"],
]

export function JobList({
  jobs,
  all,
  selectedId,
  onSelect,
  query,
  onQuery,
  eligibleOnly,
  onEligibleOnly,
  seniority,
  onSeniority,
  place,
  onClearPlace,
  appByJob,
}: Props) {
  const countFor = (key: string) =>
    all.filter((j) => j.seniority === key && (!eligibleOnly || j.eligible)).length

  return (
    <aside className="rail">
      <div className="rail-head">
        <input
          type="text"
          className="search"
          placeholder="Search role, company, skill…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />

        <div className="filters">
          <button
            className={`chip${eligibleOnly ? " on" : ""}`}
            onClick={() => onEligibleOnly(!eligibleOnly)}
            title="Hide roles you cannot take from India"
          >
            Can apply
            <span className="n">{all.filter((j) => j.eligible).length}</span>
          </button>

          {LEVELS.map(([key, label]) => (
            <button
              key={key}
              className={`chip${seniority === key ? " on" : ""}`}
              onClick={() => onSeniority(seniority === key ? null : key)}
            >
              {label}
              <span className="n">{countFor(key)}</span>
            </button>
          ))}
        </div>

        {place && (
          <button className="chip on" onClick={onClearPlace}>
            {place === "__remote__" ? "Remote only" : place} ✕
          </button>
        )}

        <div className="tiny dimmer">
          {jobs.length} {jobs.length === 1 ? "role" : "roles"}
          {selectedId && (
            <>
              {" · "}
              <button className="dimmer" style={{ textDecoration: "underline" }} onClick={() => onSelect(null)}>
                back to map
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rail-list">
        {jobs.length === 0 && (
          <div className="empty">
            Nothing matches.
            <br />
            Try clearing a filter.
          </div>
        )}

        {jobs.map((job) => {
          const tracked = appByJob.get(job.id)
          const logo = logoFor(job.company_domain)
          return (
            <button
              key={job.id}
              className={`job${selectedId === job.id ? " on" : ""}`}
              onClick={() => onSelect(job.id)}
            >
              <div className="job-top">
                <span className={`job-score ${scoreClass(job.match_score)}`}>{job.match_score}</span>
                <span className="job-title">{job.title}</span>
              </div>
              <div className="job-meta">
                {logo && (
                  <img
                    src={logo}
                    alt=""
                    width={13}
                    height={13}
                    style={{ borderRadius: 3, opacity: 0.85 }}
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).style.display = "none"
                    }}
                  />
                )}
                <span className="job-company">{job.company}</span>
                <span
                  className={`job-where${job.eligible ? "" : " locked"}`}
                  title={job.location_raw}
                >
                  {job.cities[0] ?? (job.workplace === "remote" ? "Remote" : job.location_raw || "—")}
                </span>
                <span className="dimmer job-when">{ago(job.posted_at)}</span>
                {!job.eligible && <span className="tag-locked">{job.region_lock ?? "locked"}</span>}
                {tracked && <span className="tag-applied">{tracked.stage.replace("_", " ")}</span>}
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

import { useEffect } from "react"
import type { Application, Job } from "@/lib/types"
import { ago, logoFor, scoreClass } from "@/lib/format"
import { vet } from "@/lib/vetting"

/**
 * Freshness is already on every row as "1mo ago", but only someone who knows
 * design-hiring norms can tell that 42 days is a problem. Colouring the age
 * says what the number means without adding an element to every row — most
 * rows stay quiet and only the ones worth hesitating over speak up.
 */
function whenClass(tone: string): string {
  if (tone === "bad") return "when-bad"
  if (tone === "warn") return "when-warn"
  return "dimmer"
}

/** The tone of the age signal alone, ignoring the rest of the verdict. */
function ageTone(job: Job): string {
  const signal = vet(job).signals.find((s) => s.label === "Posted" || s.label === "Open")
  return signal?.tone ?? "neutral"
}

/**
 * On a flagged row, say the real number.
 *
 * ago() rounds anything past a month to "1mo ago", which is the exact
 * fuzziness that hides a 52-day posting — and it reads posted_at, while the
 * colour comes from quality.days_open (the older of the employer's date and
 * the day we first saw it). Leaving them on different sources lets the number
 * and the reason for its colour disagree on the same row.
 */
function whenLabel(job: Job, tone: string): string {
  const days = job.quality?.days_open
  if (days == null || (tone !== "warn" && tone !== "bad")) return ago(job.posted_at)
  if (days >= 90) return `${Math.round(days / 30)}mo open`
  return `${days}d open`
}

export type Sort = "match" | "fresh" | "pay" | "company"

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
  workplace: string | null
  onWorkplace: (value: string | null) => void
  sort: Sort
  onSort: (value: Sort) => void
  place: string | null
  onClearPlace: () => void
  appByJob: Map<string, Application>
  dismissed: string[]
  onDismiss: (id: string) => void
  showDismissed: boolean
  onShowDismissed: (value: boolean) => void
}

const LEVELS: Array<[string, string]> = [
  ["senior", "Senior"],
  ["mid", "Mid"],
  ["lead", "Lead"],
  ["staff", "Staff"],
  ["manager", "Manager"],
  ["head", "Head"],
]

const SORTS: Array<[Sort, string]> = [
  ["match", "Best match"],
  ["fresh", "Newest"],
  ["pay", "Highest pay"],
  ["company", "Company"],
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
  workplace,
  onWorkplace,
  sort,
  onSort,
  place,
  onClearPlace,
  appByJob,
  dismissed,
  onDismiss,
  showDismissed,
  onShowDismissed,
}: Props) {
  const countFor = (key: string) =>
    all.filter((j) => j.seniority === key && (!eligibleOnly || j.eligible)).length

  // j and k move through the list the way they do in every tool built for
  // people who will be here a lot. Escape returns to the map.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return

      if (event.key === "Escape") {
        onSelect(null)
        return
      }
      if (event.key !== "j" && event.key !== "k") return

      event.preventDefault()
      const index = jobs.findIndex((job) => job.id === selectedId)
      if (index === -1) {
        if (jobs[0]) onSelect(jobs[0].id)
        return
      }
      const next =
        event.key === "j" ? Math.min(jobs.length - 1, index + 1) : Math.max(0, index - 1)
      const job = jobs[next]
      if (job) onSelect(job.id)
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [jobs, selectedId, onSelect])

  useEffect(() => {
    if (!selectedId) return
    document.querySelector(`[data-job="${selectedId}"]`)?.scrollIntoView({ block: "nearest" })
  }, [selectedId])

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

          {(["remote", "hybrid", "onsite"] as const).map((mode) => (
            <button
              key={mode}
              className={`chip${workplace === mode ? " on" : ""}`}
              onClick={() => onWorkplace(workplace === mode ? null : mode)}
            >
              {mode}
              <span className="n">
                {all.filter((j) => j.workplace === mode && (!eligibleOnly || j.eligible)).length}
              </span>
            </button>
          ))}
        </div>

        <div className="filters">
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

        <div className="row-between">
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value as Sort)}
            style={{ width: "auto", padding: "4px 7px", fontSize: 11.5 }}
            aria-label="Sort roles"
          >
            {SORTS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <span className="tiny dimmer">
            {jobs.length} {jobs.length === 1 ? "role" : "roles"}
            {dismissed.length > 0 && (
              <>
                {" · "}
                <button
                  className="dimmer"
                  style={{ textDecoration: "underline" }}
                  onClick={() => onShowDismissed(!showDismissed)}
                >
                  {showDismissed ? "hide hidden" : `${dismissed.length} hidden`}
                </button>
              </>
            )}
          </span>
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
          const isDismissed = dismissed.includes(job.id)
          // The overall verdict folds in how specifically the posting is
          // written, so a fresh but vague role comes back "warn". Colouring
          // the age by that would blame the date for a different problem, so
          // this reads the age signal on its own.
          const tone = ageTone(job)
          return (
            <div
              key={job.id}
              className={`job-row${isDismissed ? " faded" : ""}`}
              data-job={job.id}
            >
              <button
                className={`job${selectedId === job.id ? " on" : ""}`}
                onClick={() => onSelect(job.id)}
              >
                <div className="job-top">
                  <span className={`job-score ${scoreClass(job.match_score)}`}>
                    {job.match_score}
                  </span>
                  <span className="job-title">{job.title}</span>
                </div>
                <div className="job-meta">
                  {logo && (
                    <img
                      src={logo}
                      alt=""
                      width={13}
                      height={13}
                      style={{ borderRadius: 3, opacity: 0.85, flexShrink: 0 }}
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
                    {job.cities[0] ??
                      (job.workplace === "remote" ? "Remote" : job.location_raw || "—")}
                  </span>
                  <span className={`job-when ${whenClass(tone)}`}>
                    {whenLabel(job, tone)}
                  </span>
                  {tone === "bad" && (
                    <span
                      className="tag-stale"
                      title="Open long past the point where design shortlists close. Ask before you tailor."
                    >
                      ghost?
                    </span>
                  )}
                  {!job.eligible && (
                    <span className="tag-locked">{job.region_lock ?? "locked"}</span>
                  )}
                  {tracked && (
                    <span className="tag-applied">{tracked.stage.replace("_", " ")}</span>
                  )}
                </div>
              </button>
              <button
                className="job-dismiss"
                title={isDismissed ? "Bring this back" : "Not interested"}
                onClick={(event) => {
                  event.stopPropagation()
                  onDismiss(job.id)
                }}
              >
                {isDismissed ? "↺" : "✕"}
              </button>
            </div>
          )
        })}
      </div>
    </aside>
  )
}

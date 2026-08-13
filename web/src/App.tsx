import { useEffect, useMemo, useState } from "react"
import { loadBundle, type Bundle } from "@/lib/data"
import { applyTheme, readTheme, watchSystem, type Theme } from "./lib/theme"
import { endSession, hasSession } from "@/lib/auth"
import {
  loadDismissed,
  saveDismissed,
  loadBoard,
  saveBoard,
  loadApplications,
  loadContacts,
  loadProjects,
  loadSettings,
  saveApplications,
  saveContacts,
  saveProjects,
  saveSettings,
  today,
  uid,
} from "@/lib/store"
import type { Application, Contact, Job, Settings, Stage } from "@/lib/types"
import { Login } from "@/components/Login"
import { MapBoard } from "@/components/MapBoard"
import { JobList, type Sort } from "@/components/JobList"
import { JobDetail } from "@/components/JobDetail"
import { Tracker } from "@/components/Tracker"
import { Contacts } from "@/components/Contacts"
import { PortfolioView } from "@/components/PortfolioView"
import type { Project } from "@/lib/portfolio"
import { PayView } from "@/components/PayView"
import { SettingsView } from "@/components/SettingsView"
import { AdvisorView } from "@/components/AdvisorView"
import { TodayView } from "@/components/TodayView"
import { NegotiateView } from "@/components/NegotiateView"
import { briefing, type Action } from "@/lib/briefing"
import { ago } from "@/lib/format"

type View =
  | "today"
  | "board"
  | "advisor"
  | "tracker"
  | "contacts"
  | "portfolio"
  | "pay"
  | "negotiate"
  | "settings"

/** Dossiers are keyed by the crawler's company slug. */
const slugFor = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

export default function App() {
  const [authed, setAuthed] = useState(hasSession())
  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>("today")
  const [theme, setTheme] = useState<Theme>(() => readTheme())

  const [applications, setApplications] = useState<Application[]>(() => loadApplications())
  const [contacts, setContacts] = useState<Contact[]>(() => loadContacts())
  const [projects, setProjects] = useState<Project[]>(() => loadProjects())
  const [settings, setSettings] = useState<Settings>(() => loadSettings())

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [place, setPlace] = useState<string | null>(null)
  // A Today card about several roles hands the whole set over, so the board
  // shows exactly what the card was talking about instead of one of them.
  const [pinned, setPinned] = useState<{ ids: string[]; label: string } | null>(null)
  const [query, setQuery] = useState("")
  const savedBoard = loadBoard()
  const [eligibleOnly, setEligibleOnly] = useState(savedBoard.eligibleOnly)
  const [seniority, setSeniority] = useState<string | null>(savedBoard.seniority)
  const [workplace, setWorkplace] = useState<string | null>(savedBoard.workplace)
  const [sort, setSort] = useState<Sort>(savedBoard.sort as Sort)
  const [dismissed, setDismissed] = useState<string[]>(() => loadDismissed())
  const [showDismissed, setShowDismissed] = useState(false)

  useEffect(() => {
    if (!authed) return
    loadBundle()
      .then(setBundle)
      .catch((e: Error) => setError(e.message))
  }, [authed])

  // Paint before anything else reads a colour, and keep following the OS
  // while the preference is "system".
  useEffect(() => {
    applyTheme(theme)
    return watchSystem(theme, () => applyTheme(theme))
  }, [theme])

  useEffect(() => saveApplications(applications), [applications])
  useEffect(() => saveContacts(contacts), [contacts])
  useEffect(() => saveProjects(projects), [projects])
  useEffect(() => saveSettings(settings), [settings])
  useEffect(() => saveDismissed(dismissed), [dismissed])
  useEffect(
    () => saveBoard({ eligibleOnly, seniority, workplace, sort }),
    [eligibleOnly, seniority, workplace, sort],
  )

  const jobs = bundle?.data.jobs ?? []

  // Everything except the map's own filter. A facet must not filter itself, or
  // clicking Bengaluru would collapse the map to a single dot with no way back.
  // Everything else has to apply, though: a rail showing 12 roles beside a map
  // counting 29 in one city is the app disagreeing with itself on one screen.
  const onMap = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hidden = new Set(dismissed)
    return jobs.filter((job) => {
      if (!showDismissed && hidden.has(job.id)) return false
      if (showDismissed && !hidden.has(job.id)) return false
      if (eligibleOnly && !job.eligible) return false
      if (seniority && job.seniority !== seniority) return false
      if (workplace && job.workplace !== workplace) return false
      if (pinned && !pinned.ids.includes(job.id)) return false
      if (q) {
        const hay = `${job.title} ${job.company} ${job.location_raw} ${job.keywords.join(" ")}`
        if (!hay.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [jobs, query, eligibleOnly, seniority, workplace, pinned, dismissed, showDismissed])

  const filtered = useMemo(() => {
    const rows = onMap.filter((job) => {
      if (place === "__remote__" && job.workplace !== "remote") return false
      if (place && place !== "__remote__" && !job.points.some((p) => p.label === place))
        return false
      return true
    })

    const sorters: Record<Sort, (a: Job, b: Job) => number> = {
      match: (a, b) => b.match_score - a.match_score,
      fresh: (a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? ""),
      // Jobs with no disclosed band sort last rather than sorting as zero,
      // which would bury every Indian posting under every American one.
      pay: (a, b) =>
        (b.salary_parsed?.inr_high ?? -1) - (a.salary_parsed?.inr_high ?? -1) ||
        b.match_score - a.match_score,
      company: (a, b) => a.company.localeCompare(b.company) || b.match_score - a.match_score,
    }

    return [...rows].sort(sorters[sort])
  }, [onMap, place, sort])

  const selected = useMemo(
    () => jobs.find((j) => j.id === selectedId) ?? null,
    [jobs, selectedId],
  )

  // Computed once here rather than inside the view, because the nav badge and
  // the page have to agree on the number.
  const actions = useMemo(
    () =>
      bundle
        ? briefing(
            bundle.data.jobs,
            applications,
            contacts,
            settings,
            bundle.idf,
            projects,
          ).filter((a) => a.kind !== "nothing")
        : [],
    [bundle, applications, contacts, settings, projects],
  )

  const appByJob = useMemo(() => {
    const map = new Map<string, Application>()
    for (const row of applications) if (row.job_id) map.set(row.job_id, row)
    return map
  }, [applications])

  function upsertApplication(job: Job, stage: Stage, opened = false): void {
    setApplications((rows) => {
      const existing = rows.find((r) => r.job_id === job.id)
      if (existing) {
        return rows.map((r) =>
          r.job_id === job.id
            ? {
                ...r,
                stage,
                date_applied:
                  stage === "applied" && !r.date_applied ? today() : r.date_applied,
                activities: opened
                  ? [
                      {
                        id: uid(),
                        type: "applied" as const,
                        date: today(),
                        title: "Opened the posting to apply",
                      },
                      ...r.activities,
                    ]
                  : r.activities,
              }
            : r,
        )
      }
      const created: Application = {
        id: uid(),
        job_id: job.id,
        title: job.title,
        company: job.company,
        company_domain: job.company_domain,
        url: job.url,
        location: job.location_raw,
        work_mode: job.workplace,
        stage,
        date_saved: today(),
        date_applied: stage === "applied" ? today() : undefined,
        salary_min: job.salary_parsed?.inr_low,
        salary_max: job.salary_parsed?.inr_high,
        currency: "INR",
        contact_ids: [],
        activities: opened
          ? [{ id: uid(), type: "applied", date: today(), title: "Opened the posting to apply" }]
          : [],
      }
      return [created, ...rows]
    })
  }

  function handleApply(job: Job): void {
    window.open(job.url, "_blank", "noopener,noreferrer")
    upsertApplication(job, "applied", true)
  }

  function toggleDismiss(id: string): void {
    setDismissed((rows) => (rows.includes(id) ? rows.filter((r) => r !== id) : [...rows, id]))
    if (selectedId === id) setSelectedId(null)
  }

  function handleAction(action: Action): void {
    if (action.jobIds?.length) {
      setPinned({ ids: action.jobIds, label: action.setLabel ?? "From Today" })
      setSelectedId(null)
      setView("board")
      return
    }
    if (action.jobId) {
      setPinned(null)
      setSelectedId(action.jobId)
      setView("board")
      return
    }
    if (action.view) setView(action.view)
  }

  function addContact(seed: Partial<Contact>): void {
    const contact: Contact = {
      id: uid(),
      name: seed.name ?? "",
      title: seed.title ?? "",
      company: seed.company ?? "",
      email: seed.email,
      linkedin_url: seed.linkedin_url,
      relationship: seed.relationship ?? "other",
      notes: seed.notes,
      added: today(),
    }
    setContacts((rows) => [contact, ...rows])
  }

  if (!authed) return <Login onPass={() => setAuthed(true)} />

  if (error) {
    return (
      <div className="loading">
        <div style={{ textAlign: "center" }}>
          <p>Could not load the board.</p>
          <p className="dimmer">{error}</p>
          <p className="dimmer">Run `python cli.py build` to generate the data.</p>
        </div>
      </div>
    )
  }

  if (!bundle) return <div className="loading">loading the board…</div>

  const counts = {
    board: filtered.length,
    tracker: applications.filter((a) => !["rejected", "withdrawn", "archived"].includes(a.stage))
      .length,
    contacts: contacts.length,
    advice: bundle.advisor.insights?.insights.length ?? 0,
    actions: actions.length,
    offers: applications.filter((a) => a.stage === "offer").length,
    projects: projects.length,
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          job-lab
        </div>

        <nav className="nav">
          {(
            [
              ["today", "Today", counts.actions],
              ["board", "Board", counts.board],
              ["advisor", "Advisor", counts.advice],
              ["tracker", "Applications", counts.tracker],
              ["contacts", "Contacts", counts.contacts],
              ["portfolio", "Portfolio", counts.projects || null],
              ["pay", "Pay", null],
              ["negotiate", "Negotiate", counts.offers || null],
              ["settings", "Settings", null],
            ] as Array<[View, string, number | null]>
          ).map(([key, label, count]) => (
            <button
              key={key}
              className={view === key ? "on" : ""}
              onClick={() => setView(key)}
            >
              <span className="label">{label}</span>
              {count !== null && <span className="count">{count}</span>}
            </button>
          ))}
        </nav>

        <div className="topbar-right">
          <button
            className="chip"
            title={`Theme: ${theme}. Click to change.`}
            onClick={() =>
              setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")
            }
          >
            {theme === "dark" ? "dark" : theme === "light" ? "light" : "auto"}
          </button>
          <span title={bundle.health.generated_at}>
            rebuilt {ago(bundle.health.generated_at.slice(0, 10))}
          </span>
          <button
            className="chip"
            onClick={() => {
              endSession()
              setAuthed(false)
            }}
          >
            lock
          </button>
        </div>
      </header>

      <main className="main">
        {view === "board" && (
          <div className="board">
            <JobList
              jobs={filtered}
              all={jobs}
              selectedId={selectedId}
              onSelect={setSelectedId}
              query={query}
              onQuery={setQuery}
              eligibleOnly={eligibleOnly}
              onEligibleOnly={setEligibleOnly}
              seniority={seniority}
              onSeniority={setSeniority}
              workplace={workplace}
              onWorkplace={setWorkplace}
              pinned={pinned}
              onClearPinned={() => setPinned(null)}
              sort={sort}
              onSort={setSort}
              place={place}
              onClearPlace={() => setPlace(null)}
              appByJob={appByJob}
              dismissed={dismissed}
              onDismiss={toggleDismiss}
              showDismissed={showDismissed}
              onShowDismissed={setShowDismissed}
            />
            {selected ? (
              <JobDetail
                job={selected}
                company={bundle.data.companies[selected.company]}
                dossier={bundle.dossiers[slugFor(selected.company)]}
                settings={settings}
                idf={bundle.idf}
                application={appByJob.get(selected.id)}
                contacts={contacts}
                onApply={handleApply}
                onStage={(job, stage) => upsertApplication(job, stage)}
                onAddContact={addContact}
                onOpenSettings={() => setView("settings")}
                onClose={() => setSelectedId(null)}
              />
            ) : (
              <MapBoard
                world={bundle.world}
                places={bundle.data.places}
                jobs={onMap}
                selectedPlace={place}
                onSelectPlace={setPlace}
                eligibleOnly={eligibleOnly}
              />
            )}
          </div>
        )}

        {view === "today" && (
          <TodayView
            actions={actions}
            jobs={jobs}
            applications={applications}
            contacts={contacts}
            settings={settings}
            generatedAt={bundle.health.generated_at}
            onGo={handleAction}
          />
        )}

        {view === "advisor" && <AdvisorView advisor={bundle.advisor} />}

        {view === "tracker" && (
          <Tracker
            applications={applications}
            contacts={contacts}
            onChange={setApplications}
            onOpenJob={(jobId) => {
              setSelectedId(jobId)
              setView("board")
            }}
          />
        )}

        {view === "portfolio" && (
          <PortfolioView jobs={bundle.data.jobs} projects={projects} onChange={setProjects} />
        )}

        {view === "contacts" && (
          <Contacts
            contacts={contacts}
            onChange={setContacts}
            applications={applications}
            jobs={bundle.data.jobs}
            settings={settings}
            idf={bundle.idf}
          />
        )}

        {view === "pay" && (
          <PayView
            pay={bundle.data.pay}
            benchmarks={bundle.benchmarks}
            settings={settings}
            health={bundle.health}
          />
        )}

        {view === "negotiate" && (
          <NegotiateView
            benchmarks={bundle.benchmarks}
            settings={settings}
            applications={applications}
          />
        )}

        {view === "settings" && (
          <SettingsView
            settings={settings}
            onChange={setSettings}
            health={bundle.health}
            onRestored={() => {
              setApplications(loadApplications())
              setContacts(loadContacts())
              setProjects(loadProjects())
              setSettings(loadSettings())
            }}
          />
        )}
      </main>
    </div>
  )
}

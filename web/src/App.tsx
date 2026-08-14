import { useEffect, useMemo, useRef, useState } from "react"
import { loadBundle, type Bundle } from "@/lib/data"
import { applyTheme, readTheme, watchSystem, type Theme } from "./lib/theme"
import { endSession, hasSession } from "@/lib/auth"
import {
  loadDismissed,
  canUseLocalStorage,
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
import { matchResume } from "@/lib/resume"
import { worthYourHour } from "@/lib/outcomes"

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

const NAV_ITEMS: Array<[View, string]> = [
  ["today", "Today"],
  ["board", "Board"],
  ["advisor", "Advisor"],
  ["tracker", "Applications"],
  ["contacts", "Contacts"],
  ["portfolio", "Portfolio"],
  ["pay", "Pay"],
  ["negotiate", "Negotiate"],
  ["settings", "Settings"],
]

const MOBILE_PRIMARY: View[] = ["today", "board", "tracker", "contacts"]

/** Dossiers are keyed by the crawler's company slug. */
const slugFor = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

export default function App() {
  const [authed, setAuthed] = useState(hasSession())
  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>("today")
  const [theme, setTheme] = useState<Theme>(() => readTheme())
  const [mobileMore, setMobileMore] = useState(false)
  const [loadRevision, setLoadRevision] = useState(0)
  const [volatileSession, setVolatileSession] = useState(false)
  const [storageAvailable] = useState(canUseLocalStorage)
  const [mobileViewport, setMobileViewport] = useState(() =>
    window.matchMedia("(max-width: 760px)").matches,
  )
  const mobileMoreButton = useRef<HTMLButtonElement>(null)
  const mobileMorePanel = useRef<HTMLElement>(null)
  const wasMobileMoreOpen = useRef(false)
  const restoreMoreFocus = useRef(true)

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
    setError(null)
    setBundle(null)
    loadBundle()
      .then(setBundle)
      .catch((e: Error) => setError(e.message))
  }, [authed, loadRevision])

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

  useEffect(() => {
    if (!mobileMore) {
      if (wasMobileMoreOpen.current && restoreMoreFocus.current) mobileMoreButton.current?.focus()
      wasMobileMoreOpen.current = false
      restoreMoreFocus.current = true
      return
    }
    wasMobileMoreOpen.current = true
    mobileMorePanel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus()
    function manageDialogKeys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileMore(false)
        return
      }
      if (event.key !== "Tab") return
      const focusable = Array.from(
        mobileMorePanel.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", manageDialogKeys)
    return () => window.removeEventListener("keydown", manageDialogKeys)
  }, [mobileMore])

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)")
    function handleViewportChange(event: MediaQueryListEvent): void {
      setMobileViewport(event.matches)
      if (!event.matches) setMobileMore(false)
    }
    media.addEventListener("change", handleViewportChange)
    return () => media.removeEventListener("change", handleViewportChange)
  }, [])

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

  const worthByJob = useMemo(() => {
    const map = new Map<string, ReturnType<typeof worthYourHour>>()
    if (!bundle) return map
    for (const job of jobs) {
      const resumeScore = settings.resume_text.trim()
        ? matchResume(settings.resume_text, job, bundle.idf, bundle.profile.strengths ?? []).score
        : null
      map.set(
        job.id,
        worthYourHour(job, applications, contacts, jobs, resumeScore, projects.length > 0),
      )
    }
    return map
  }, [bundle, jobs, applications, contacts, settings.resume_text, projects.length])

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
      worth: (a, b) =>
        (worthByJob.get(b.id)?.score ?? 0) - (worthByJob.get(a.id)?.score ?? 0) ||
        b.match_score - a.match_score,
    }

    return [...rows].sort(sorters[sort])
  }, [onMap, place, sort, worthByJob])

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
            bundle.profile.strengths ?? [],
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

  function changeView(next: View): void {
    const fromSheet = mobileMore
    if (fromSheet) restoreMoreFocus.current = false
    setView(next)
    setMobileMore(false)
    if (fromSheet) requestAnimationFrame(() => document.querySelector<HTMLElement>("#main-content")?.focus())
  }

  function cycleTheme(): void {
    setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")
  }

  function lock(): void {
    endSession()
    setAuthed(false)
    setMobileMore(false)
  }

  function retryLoad(): void {
    setLoadRevision((revision) => revision + 1)
  }

  function closeDetail(): void {
    const returnId = selectedId
    setSelectedId(null)
    if (returnId) {
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`[data-job="${returnId}"] .job`)?.focus(),
      )
    }
  }

  if (!authed) {
    return (
      <Login
        onPass={(persisted) => {
          setVolatileSession(!persisted)
          setAuthed(true)
        }}
      />
    )
  }

  if (error) {
    return (
      <div className="state-page" data-state="load-error">
        <div className="state-card">
          <span className="state-mark" aria-hidden="true">!</span>
          <h1>Board unavailable</h1>
          <p>
            {navigator.onLine
              ? "The app opened, but its required job data did not. Your locally saved applications and contacts have not been changed."
              : "You appear to be offline. The board needs its generated data files before it can open."}
          </p>
          <code>{error}</code>
          <button className="btn btn-primary" onClick={retryLoad}>
            Try loading again
          </button>
          <p className="state-note">
            If this keeps happening, rebuild the data with <span className="mono">python cli.py build</span>{" "}
            and redeploy the <span className="mono">web/dist</span> folder.
          </p>
        </div>
      </div>
    )
  }

  if (!bundle) {
    return (
      <div className="loading" role="status" aria-live="polite">
        Loading current roles and your local workspace…
      </div>
    )
  }

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
  const countForView: Partial<Record<View, number>> = {
    today: counts.actions,
    board: counts.board,
    advisor: counts.advice,
    tracker: counts.tracker,
    contacts: counts.contacts,
    portfolio: counts.projects,
    negotiate: counts.offers,
  }
  const currentLabel = NAV_ITEMS.find(([key]) => key === view)?.[1] ?? ""
  const generatedAt = Date.parse(bundle.health.generated_at)
  const sourceAgeDays = Number.isFinite(generatedAt)
    ? Math.floor((Date.now() - generatedAt) / 86_400_000)
    : null
  const sourceProblem =
    jobs.length === 0
      ? {
          tone: "bad",
          text: "The latest build contains no roles. Treat this as a crawl failure, not an empty market.",
        }
      : sourceAgeDays !== null && sourceAgeDays >= 3
        ? {
            tone: "warn",
            text: `This board is ${sourceAgeDays} days old. Confirm every posting is still open before tailoring an application.`,
          }
        : bundle.unavailable.length > 0
          ? {
              tone: "warn",
              text: `${bundle.unavailable.length} optional evidence ${
                bundle.unavailable.length === 1 ? "feed is" : "feeds are"
              } unavailable. The Board still works; affected Advisor or company evidence will say when it is missing.`,
            }
          : null
  const hasNotice = Boolean(sourceProblem || !storageAvailable || volatileSession)

  return (
    <div className="shell">
      <a
        className="skip-link"
        href="#main-content"
        inert={mobileMore}
        onClick={() =>
          requestAnimationFrame(() => document.querySelector<HTMLElement>("#main-content")?.focus())
        }
      >
        Skip to main content
      </a>
      <header className="topbar" inert={mobileMore}>
        <div className="brand">
          <span className="brand-dot" />
          job-lab
        </div>
        <span className="mobile-current">{currentLabel}</span>

        <nav className="nav" aria-label="Primary">
          {NAV_ITEMS.map(([key, label]) => {
            const count = countForView[key]
            return (
            <button
              key={key}
              className={view === key ? "on" : ""}
              onClick={() => changeView(key)}
            >
              <span className="label">{label}</span>
              {count !== undefined && count > 0 && <span className="count">{count}</span>}
            </button>
            )
          })}
        </nav>

        <div className="topbar-right">
          <button
            className="chip"
            title={`Theme: ${theme}. Click to change.`}
            onClick={cycleTheme}
          >
            {theme === "dark" ? "dark" : theme === "light" ? "light" : "auto"}
          </button>
          <span title={bundle.health.generated_at}>
            rebuilt {ago(bundle.health.generated_at.slice(0, 10))}
          </span>
          <button
            className="chip"
            onClick={lock}
          >
            lock
          </button>
        </div>
      </header>

      <main
        id="main-content"
        className={`main${hasNotice ? " has-alert" : ""}`}
        tabIndex={-1}
        inert={mobileMore}
      >
        {hasNotice && (
          <div className="notice-stack" role="status">
            {sourceProblem && (
              <div className={`global-notice ${sourceProblem.tone}`}>
                <span>{sourceProblem.text}</span>
                <button onClick={retryLoad}>Reload data</button>
              </div>
            )}
            {!storageAvailable && (
              <div className="global-notice bad">
                <span>
                  Browser storage is blocked or full. Changes made now can disappear when this page closes.
                </span>
                <button onClick={() => changeView("settings")}>Storage details</button>
              </div>
            )}
            {volatileSession && (
              <div className="global-notice warn">
                <span>This browser cannot keep the lock session. You may need to unlock again after a reload.</span>
              </div>
            )}
          </div>
        )}
        {view === "board" && (
          <div className="board">
            <JobList
              jobs={filtered}
              all={jobs}
              selectedId={selectedId}
              onSelect={(id) => (id ? setSelectedId(id) : closeDetail())}
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
              worthByJob={worthByJob}
              dismissed={dismissed}
              onDismiss={toggleDismiss}
              showDismissed={showDismissed}
              onShowDismissed={setShowDismissed}
              inactive={mobileViewport && Boolean(selected)}
              shortcutsDisabled={mobileMore}
            />
            {selected ? (
              <JobDetail
                job={selected}
                company={bundle.data.companies[selected.company]}
                profile={bundle.profile}
                dossier={bundle.dossiers[slugFor(selected.company)]}
                settings={settings}
                idf={bundle.idf}
                application={appByJob.get(selected.id)}
                applications={applications}
                jobs={jobs}
                contacts={contacts}
                onApply={handleApply}
                onStage={(job, stage) => upsertApplication(job, stage)}
                onAddContact={addContact}
                onOpenSettings={() => setView("settings")}
                onClose={closeDetail}
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
            jobs={jobs}
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
            strengths={bundle.profile.strengths ?? []}
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

      <nav className="mobile-nav" aria-label="Mobile navigation" inert={mobileMore}>
        {NAV_ITEMS.filter(([key]) => MOBILE_PRIMARY.includes(key)).map(([key, label]) => {
          const count = countForView[key]
          return (
            <button
              key={key}
              className={view === key ? "on" : ""}
              aria-current={view === key ? "page" : undefined}
              onClick={() => changeView(key)}
            >
              <span>{label}</span>
              {count !== undefined && count > 0 && <b>{count}</b>}
            </button>
          )
        })}
        <button
          ref={mobileMoreButton}
          className={mobileMore || !MOBILE_PRIMARY.includes(view) ? "on" : ""}
          aria-expanded={mobileMore}
          aria-controls="mobile-more"
          onClick={() => setMobileMore((open) => !open)}
        >
          <span>More</span>
          <i aria-hidden="true">•••</i>
        </button>
      </nav>

      {mobileMore && (
        <div className="mobile-more-layer">
          <button
            className="mobile-more-backdrop"
            aria-label="Close navigation"
            onClick={() => setMobileMore(false)}
          />
          <aside
            ref={mobileMorePanel}
            id="mobile-more"
            className="mobile-more"
            role="dialog"
            aria-modal="true"
            aria-label="More navigation"
          >
            <div className="mobile-more-head">
              <div>
                <span className="kicker">Navigate</span>
                <strong>More job-search tools</strong>
              </div>
              <button
                className="mobile-sheet-close"
                data-autofocus
                onClick={() => setMobileMore(false)}
              >
                Close
              </button>
            </div>
            <div className="mobile-more-grid">
              {NAV_ITEMS.filter(([key]) => !MOBILE_PRIMARY.includes(key)).map(([key, label]) => {
                const count = countForView[key]
                return (
                  <button
                    key={key}
                    className={view === key ? "on" : ""}
                    onClick={() => changeView(key)}
                  >
                    <span>{label}</span>
                    {count !== undefined && count > 0 && <b>{count}</b>}
                  </button>
                )
              })}
            </div>
            <div className="mobile-more-actions">
              <button onClick={cycleTheme}>
                Theme <span>{theme === "system" ? "auto" : theme}</span>
              </button>
              <button onClick={lock}>
                Lock <span>private data</span>
              </button>
            </div>
            <p>Board rebuilt {ago(bundle.health.generated_at.slice(0, 10))}.</p>
          </aside>
        </div>
      )}
    </div>
  )
}

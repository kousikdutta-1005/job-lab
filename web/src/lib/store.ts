/**
 * Everything personal, kept in this browser and nowhere else.
 *
 * No account, no sync, no server. That is a real trade: clearing site data
 * loses the lot. So every store is exportable to a JSON file from Settings,
 * and importable back, which is the honest version of a backup for a tool with
 * no backend.
 */

import type { Application, Contact, Settings, Stage } from "./types"
import type { Project } from "./portfolio"

const KEYS = {
  applications: "joblab.applications",
  contacts: "joblab.contacts",
  settings: "joblab.settings",
  dismissed: "joblab.dismissed",
  board: "joblab.board",
  projects: "joblab.projects",
} as const

export function canUseLocalStorage(): boolean {
  const key = "joblab.storage-check"
  try {
    localStorage.setItem(key, "1")
    const ok = localStorage.getItem(key) === "1"
    localStorage.removeItem(key)
    return ok
  } catch {
    return false
  }
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota or private mode; the UI keeps working for this session */
  }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export const today = (): string => new Date().toISOString().slice(0, 10)

/* ---------------------------------------------------------- applications */

export const STAGES: Array<{ key: Stage; label: string; terminal: boolean }> = [
  { key: "wishlist", label: "Shortlist", terminal: false },
  { key: "applied", label: "Applied", terminal: false },
  { key: "phone_screen", label: "Screen", terminal: false },
  { key: "interview", label: "Interview", terminal: false },
  { key: "offer", label: "Offer", terminal: false },
  { key: "accepted", label: "Accepted", terminal: true },
  { key: "rejected", label: "Rejected", terminal: true },
  { key: "withdrawn", label: "Withdrawn", terminal: true },
  { key: "archived", label: "Archived", terminal: true },
]

export const STAGE_LABEL: Record<Stage, string> = Object.fromEntries(
  STAGES.map((s) => [s.key, s.label]),
) as Record<Stage, string>

export const loadApplications = (): Application[] => read<Application[]>(KEYS.applications, [])
export const saveApplications = (rows: Application[]): void => write(KEYS.applications, rows)

export const loadContacts = (): Contact[] => read<Contact[]>(KEYS.contacts, [])
export const saveContacts = (rows: Contact[]): void => write(KEYS.contacts, rows)

export const loadProjects = (): Project[] => read<Project[]>(KEYS.projects, [])
export const saveProjects = (rows: Project[]): void => write(KEYS.projects, rows)

export const loadDismissed = (): string[] => read<string[]>(KEYS.dismissed, [])
export const saveDismissed = (ids: string[]): void => write(KEYS.dismissed, ids)

export const DEFAULT_SETTINGS: Settings = {
  full_name: "",
  email: "",
  phone: "",
  portfolio: "",
  linkedin: "",
  location: "India",
  years: 5,
  resume_text: "",
  resume_name: "",
}

export const loadSettings = (): Settings => ({
  ...DEFAULT_SETTINGS,
  ...read<Partial<Settings>>(KEYS.settings, {}),
})

export const saveSettings = (value: Settings): void => write(KEYS.settings, value)

/* ------------------------------------------------------------- portability */

export function exportAll(): string {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      version: 1,
      applications: loadApplications(),
      contacts: loadContacts(),
      settings: loadSettings(),
      dismissed: loadDismissed(),
      projects: loadProjects(),
    },
    null,
    2,
  )
}

export function importAll(raw: string): { ok: boolean; message: string } {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (Array.isArray(parsed.applications)) saveApplications(parsed.applications as Application[])
    if (Array.isArray(parsed.contacts)) saveContacts(parsed.contacts as Contact[])
    if (Array.isArray(parsed.dismissed)) saveDismissed(parsed.dismissed as string[])
    if (Array.isArray(parsed.projects)) saveProjects(parsed.projects as Project[])
    if (parsed.settings && typeof parsed.settings === "object") {
      saveSettings({ ...DEFAULT_SETTINGS, ...(parsed.settings as Partial<Settings>) })
    }
    return { ok: true, message: "Restored." }
  } catch (error) {
    return { ok: false, message: `Could not read that file: ${(error as Error).message}` }
  }
}

export function download(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/* The board's filter state. Small, but resetting "can apply only" on every
   visit meant re-hiding two hundred roles you cannot take, every time. */
export interface BoardState {
  eligibleOnly: boolean
  seniority: string | null
  workplace: string | null
  sort: string
}

export const DEFAULT_BOARD: BoardState = {
  eligibleOnly: true,
  seniority: null,
  workplace: null,
  sort: "worth",
}

export const loadBoard = (): BoardState => ({
  ...DEFAULT_BOARD,
  ...read<Partial<BoardState>>(KEYS.board, {}),
})

export const saveBoard = (value: BoardState): void => write(KEYS.board, value)

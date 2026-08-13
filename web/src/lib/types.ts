export type Confidence = "verified" | "likely" | "declared" | "observed" | "guess" | "unusable" | "none"

export interface Point {
  label: string
  country: string
  lat: number
  lon: number
  approximate?: boolean
}

export interface SalaryBand {
  currency: string
  period: string
  low: number
  high: number
  inr_low: number
  inr_high: number
  source_text: string
}

export interface LinkedInSearch {
  label: string
  url: string
  kind: "decision-maker" | "recruiter" | "referral"
}

export interface LinkedInLinks {
  company_page: string
  people: string
  jobs: string
  searches: LinkedInSearch[]
}

export interface Job {
  id: string
  title: string
  company: string
  company_slug: string
  source: string
  url: string
  location_raw: string
  description_text: string
  department: string | null
  posted_at: string | null
  salary: string | null
  salary_parsed: SalaryBand | null

  workplace: "remote" | "hybrid" | "onsite" | "unknown"
  cities: string[]
  points: Point[]
  india: boolean
  region_lock: string | null
  eligible: boolean
  eligibility_reason: string
  seniority: string
  seniority_label: string
  years_min: number | null
  years_max: number | null
  keywords: string[]
  keyword_groups: Record<string, string[]>

  company_domain: string | null
  email_pattern: string | null
  email_pattern_confidence: Confidence
  linkedin: LinkedInLinks

  match_score: number
  match_reasons: string[]
  quality: JobQuality
}

export interface JobQuality {
  days_open: number | null
  days_open_basis: "first_seen_in_history" | "ats_posted_date" | "not_enough_job_history"
  repost_count: number | null
  always_open: boolean | null
  description_specificity: number
  description_specificity_method: string
  company_posting_velocity: {
    current: number
    historical_median: number | null
    ratio: number | null
    status: "ok" | "not_enough_history"
  }
  history_days: number
  verdict: string
}

export interface Place {
  label: string
  country: string
  lat: number
  lon: number
  approximate: boolean
  jobs: number
  eligible: number
  companies: number
  top_score: number
}

export interface PatternGuess {
  pattern: string
  label: string
  source: "observed" | "prevalence"
  weight?: number
}

export interface CompanyContacts {
  domain: string | null
  confidence: Confidence
  mail?: { accepts_mail: boolean; provider: string | null; checked: boolean; records?: string[] }
  patterns: PatternGuess[]
  note: string
}

export interface CompanyInfo {
  domain: string | null
  tags: string[]
  contacts: CompanyContacts
  linkedin: LinkedInLinks
  open_roles: number
}

export interface CompanyFact<T = string | number | boolean | null> {
  value: T
  source: string
  as_of: string
}

export interface CompanyDossier {
  name: string
  domain: string | null
  facts: Record<string, CompanyFact>
}

export interface Band {
  n: number
  min: number
  p25: number
  median: number
  p75: number
  max: number
}

export interface Pay {
  coverage: { jobs: number; disclosed: number; share: number; india_disclosed: number }
  by_seniority: Record<string, Band>
  by_city: Record<string, Band>
  india_by_seniority: Record<string, Band>
  remote_eligible: Band | null
  top_paying: Array<{
    title: string
    company: string
    location: string
    url: string
    band: SalaryBand
  }>
}

export interface Dataset {
  jobs: Job[]
  places: Place[]
  pay: Pay
  companies: Record<string, CompanyInfo>
}

export interface Health {
  generated_at: string
  version: string
  duration_seconds: number
  counts: Record<string, number>
  by_source: Record<string, number>
  by_seniority: Record<string, number>
  by_workplace: Record<string, number>
  sources: Array<Record<string, unknown>>
  companies_without_board: Array<{ name: string; why: string }>
  corpus: {
    documents: number
    distinct_terms: number
    most_common: Array<{ term: string; jobs: number; share: number; idf: number }>
    most_distinctive: Array<{ term: string; jobs: number; idf: number }>
  }
}

export interface Profile {
  name: string
  title: string
  years_experience: number
  portfolio: string
  location: string
  open_to: string[]
  target_titles: string[]
  strengths: string[]
  prefer_tags: string[]
}

/* ------------------------------------------------------------ local state */

export type Stage =
  | "wishlist"
  | "applied"
  | "phone_screen"
  | "interview"
  | "offer"
  | "accepted"
  | "rejected"
  | "withdrawn"
  | "archived"

export interface Activity {
  id: string
  type: "email_sent" | "call_made" | "interview" | "offer" | "note" | "applied"
  date: string
  title: string
  notes?: string
}

export interface Application {
  id: string
  job_id: string | null
  title: string
  company: string
  company_domain?: string | null
  url: string
  location: string
  work_mode: string
  stage: Stage
  date_saved: string
  date_applied?: string
  follow_up_date?: string
  salary_min?: number
  salary_max?: number
  currency?: string
  excitement?: number
  notes?: string
  resume_version?: string
  contact_ids: string[]
  activities: Activity[]
}

export interface Contact {
  id: string
  name: string
  title: string
  company: string
  email?: string
  linkedin_url?: string
  relationship: "hiring_manager" | "recruiter" | "referral" | "employee" | "other"
  notes?: string
  added: string
  last_contacted?: string
}

export interface Settings {
  full_name: string
  email: string
  phone: string
  portfolio: string
  linkedin: string
  location: string
  years: number
  current_ctc?: number
  target_ctc?: number
  resume_text: string
  resume_name: string
}

export interface BenchmarkBand {
  role: string
  city: string
  region: string
  country: string
  seniority: string
  years_experience: string
  currency: string
  low: number
  median: number
  high: number
  low_inr: number
  median_inr: number
  high_inr: number
  source_name: string
  source_url: string
  confidence: "verified" | "reported"
  retrieved_at: string
  notes?: string
}

export interface Benchmarks {
  retrieved_at: string
  note: string
  bands: BenchmarkBand[]
}

import type { Benchmarks, CompanyDossier, Dataset, Health, Profile } from "./types"
import type { Advisor } from "@/components/AdvisorView"

/** Everything the nightly crawl produced, fetched once and shared. */
export interface Bundle {
  data: Dataset
  health: Health
  profile: Profile
  idf: Record<string, number>
  world: GeoJSON
  advisor: Advisor
  benchmarks?: Benchmarks
  /** Company facts keyed by slug, each carrying the URL it came from. */
  dossiers: Record<string, CompanyDossier>
  /** Optional generated files that could not be loaded. Core board data never lands here. */
  unavailable: string[]
}

export interface GeoJSON {
  type: "FeatureCollection"
  features: Array<{
    type: "Feature"
    properties: { name: string; iso: string }
    geometry:
      | { type: "Polygon"; coordinates: number[][][] }
      | { type: "MultiPolygon"; coordinates: number[][][][] }
  }>
}

interface OptionalResult<T> {
  value?: T
  error?: string
}

/** Optional files: keep the core board usable, but report exactly what is missing. */
async function maybe<T>(path: string): Promise<OptionalResult<T>> {
  try {
    return { value: await grab<T>(path) }
  } catch (error) {
    return { error: `${path}: ${(error as Error).message}` }
  }
}

async function grab<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${path}`, { cache: "no-cache" })
  if (!res.ok) throw new Error(`${path} failed: HTTP ${res.status}`)
  try {
    return (await res.json()) as T
  } catch {
    throw new Error(`${path} is not valid JSON`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || isNumber(value)
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function isBand(value: unknown): boolean {
  return (
    isRecord(value) &&
    ["n", "min", "p25", "median", "p75", "max"].every((field) => isNumber(value[field]))
  )
}

function isSalaryBand(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.currency === "string" &&
    typeof value.period === "string" &&
    typeof value.source_text === "string" &&
    ["low", "high", "inr_low", "inr_high"].every((field) => isNumber(value[field]))
  )
}

function isLinkedInSearch(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    typeof value.url === "string" &&
    ["decision-maker", "recruiter", "referral"].includes(String(value.kind))
  )
}

function isLinkedInLinks(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.company_page === "string" &&
    typeof value.people === "string" &&
    typeof value.jobs === "string" &&
    Array.isArray(value.searches) &&
    value.searches.every(isLinkedInSearch)
  )
}

function isPattern(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.pattern === "string" &&
    typeof value.label === "string" &&
    typeof value.source === "string" &&
    (value.weight === undefined || isNumber(value.weight))
  )
}

function isNumericRecord(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every(isNumber)
}

function isPosition(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 2 && isNumber(value[0]) && isNumber(value[1])
}

function isPolygon(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((ring) => Array.isArray(ring) && ring.every(isPosition))
  )
}

function checkedOptional<T>(
  result: OptionalResult<T>,
  path: string,
  validate: (value: unknown) => boolean,
): OptionalResult<T> {
  if (result.value !== undefined && !validate(result.value)) {
    return { error: `${path} is malformed: required fields have invalid values` }
  }
  return result
}

function isRoleRef(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    ["company", "seniority", "location", "url"].every(
      (field) => value[field] === undefined || typeof value[field] === "string",
    )
  )
}

function isInsightEvidence(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return true
  if (value.every((item) => typeof item === "string")) return true
  if (!value.every(isRecord)) return false
  if ("company" in value[0]) {
    return value.every(
      (item) =>
        typeof item.company === "string" &&
        isNumber(item.open_roles) &&
        (item.roles === undefined ||
          (Array.isArray(item.roles) && item.roles.every(isRoleRef))),
    )
  }
  if ("term" in value[0]) {
    return value.every(
      (item) =>
        typeof item.term === "string" &&
        (item.examples === undefined ||
          (Array.isArray(item.examples) && item.examples.every(isRoleRef))) &&
        ["senior_jobs", "share", "leverage", "mid_jobs", "jobs", "lift", "idf"].every(
          (field) => item[field] === undefined || isNumber(item[field]),
        ),
    )
  }
  return true
}

function isInsights(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.generated_at === "string" &&
    Array.isArray(value.insights) &&
    value.insights.every(
      (insight) =>
        isRecord(insight) &&
        typeof insight.headline === "string" &&
        typeof insight.body === "string" &&
        (insight.evidence === undefined || isInsightEvidence(insight.evidence)),
    )
  )
}

function isNews(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.generated_at === "string" &&
    Array.isArray(value.sources) &&
    Array.isArray(value.items) &&
    value.items.every(
      (item) =>
        isRecord(item) &&
        typeof item.title === "string" &&
        typeof item.url === "string" &&
        typeof item.source === "string" &&
        (item.published === undefined || typeof item.published === "string") &&
        (item.summary === undefined || typeof item.summary === "string") &&
        (item.tags === undefined || isStringArray(item.tags)),
    )
  )
}

function isTrends(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.generated_at === "string" &&
    isNumber(value.history_days) &&
    isRecord(value.latest) &&
    isRecord(value.comparisons)
  )
}

function isRelocation(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.generated_at === "string" &&
    Array.isArray(value.cities) &&
    value.cities.every(
      (city) =>
        isRecord(city) &&
        typeof city.city === "string" &&
        [
          "country",
          "visa_difficulty_label",
          "visa_difficulty",
          "visa_note",
          "tax_note",
          "verdict",
        ].every((field) => city[field] === undefined || typeof city[field] === "string") &&
        [
          "jobs",
          "salary_samples",
          "nominal_median_pay_inr",
          "ppp_adjusted_vs_bengaluru_pct",
          "visa_attainability",
          "effective_tax_rate",
        ].every((field) => city[field] === undefined || isNumber(city[field])) &&
        (city.expected_uplift_pct === undefined || isNumberOrNull(city.expected_uplift_pct)) &&
        (city.pay_basis === undefined ||
          (isRecord(city.pay_basis) &&
            (city.pay_basis.kind === undefined || typeof city.pay_basis.kind === "string") &&
            (city.pay_basis.tier === undefined || isNumber(city.pay_basis.tier)) &&
            (city.pay_basis.samples === undefined || isNumber(city.pay_basis.samples)))),
    )
  )
}

function isBenchmarks(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.retrieved_at === "string" &&
    typeof value.note === "string" &&
    Array.isArray(value.bands) &&
    value.bands.every(
      (band) =>
        isRecord(band) &&
        ["role", "city", "region", "country", "seniority", "years_experience", "currency", "source_name", "source_url", "confidence", "retrieved_at"].every(
          (field) => typeof band[field] === "string",
        ) &&
        ["low", "median", "high", "low_inr", "median_inr", "high_inr"].every((field) =>
          isNumber(band[field]),
        ) &&
        (band.notes === undefined || typeof band.notes === "string"),
    )
  )
}

function isDossiers(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRecord(value.companies) &&
    Object.values(value.companies).every(
      (company) =>
        isRecord(company) &&
        typeof company.name === "string" &&
        isStringOrNull(company.domain) &&
        isRecord(company.facts) &&
        Object.values(company.facts).every(
          (fact) =>
            isRecord(fact) &&
            typeof fact.source === "string" &&
            typeof fact.as_of === "string" &&
            (fact.value === null || ["string", "number", "boolean"].includes(typeof fact.value)),
        ),
    )
  )
}

function validateCore(
  data: Dataset,
  health: Health,
  profile: Profile,
  idf: Record<string, number>,
  world: GeoJSON,
): void {
  if (!isRecord(data) || !Array.isArray(data.jobs)) {
    throw new Error("jobs.json is malformed: expected a jobs array")
  }
  if (!Array.isArray(data.places)) {
    throw new Error("jobs.json is malformed: expected a places array")
  }
  if (!isRecord(data.companies)) {
    throw new Error("jobs.json is malformed: expected a companies index")
  }
  Object.entries(data.companies).forEach(([slug, company]) => {
    if (
      !isRecord(company) ||
      !isStringOrNull(company.domain) ||
      !isStringArray(company.tags) ||
      !isNumber(company.open_roles) ||
      !isRecord(company.contacts) ||
      !isStringOrNull(company.contacts.domain) ||
      typeof company.contacts.confidence !== "string" ||
      typeof company.contacts.note !== "string" ||
      !Array.isArray(company.contacts.patterns) ||
      !company.contacts.patterns.every(isPattern) ||
      !isLinkedInLinks(company.linkedin)
    ) {
      throw new Error(`jobs.json is malformed: company ${slug} has invalid contact data`)
    }
  })
  if (
    !isRecord(data.pay) ||
    !isRecord(data.pay.coverage) ||
    !isRecord(data.pay.by_seniority) ||
    !isRecord(data.pay.by_city) ||
    !isRecord(data.pay.india_by_seniority) ||
    !Array.isArray(data.pay.top_paying)
  ) {
    throw new Error("jobs.json is malformed: pay evidence is incomplete")
  }
  if (
    !Object.values(data.pay.coverage).every(isNumber) ||
    !Object.values(data.pay.by_seniority).every(isBand) ||
    !Object.values(data.pay.by_city).every(isBand) ||
    !Object.values(data.pay.india_by_seniority).every(isBand) ||
    (data.pay.unstated_level !== null && !isBand(data.pay.unstated_level)) ||
    (data.pay.remote_eligible !== null && !isBand(data.pay.remote_eligible)) ||
    data.pay.top_paying.some(
      (row) =>
        !isRecord(row) ||
        typeof row.title !== "string" ||
        typeof row.company !== "string" ||
        typeof row.location !== "string" ||
        typeof row.url !== "string" ||
        !isSalaryBand(row.band),
    )
  ) {
    throw new Error("jobs.json is malformed: pay evidence contains invalid values")
  }
  data.places.forEach((place, index) => {
    if (
      !isRecord(place) ||
      typeof place.label !== "string" ||
      typeof place.country !== "string" ||
      typeof place.lat !== "number" ||
      typeof place.lon !== "number" ||
      typeof place.approximate !== "boolean" ||
      !["jobs", "eligible", "companies", "top_score"].every((field) => isNumber(place[field]))
    ) {
      throw new Error(`jobs.json is malformed: place ${index + 1} has invalid map data`)
    }
  })
  data.jobs.forEach((job, index) => {
    if (!isRecord(job)) throw new Error(`jobs.json is malformed: job ${index + 1} is not an object`)
    for (const field of ["id", "title", "company", "url"] as const) {
      if (typeof job[field] !== "string" || !job[field].trim()) {
        throw new Error(`jobs.json is malformed: job ${index + 1} has no ${field}`)
      }
    }
    for (const field of ["keywords", "cities", "match_reasons"] as const) {
      if (!isStringArray(job[field])) {
        throw new Error(`jobs.json is malformed: ${job.title} has invalid ${field}`)
      }
    }
    if (
      !isRecord(job.keyword_groups) ||
      !Object.values(job.keyword_groups).every(isStringArray) ||
      !isLinkedInLinks(job.linkedin)
    ) {
      throw new Error(`jobs.json is malformed: ${job.title} has incomplete matching/contact data`)
    }
    if (
      ![
        "company_slug",
        "source",
        "location_raw",
        "description_text",
        "workplace",
        "eligibility_reason",
        "seniority",
        "seniority_label",
        "email_pattern_confidence",
      ].every((field) => typeof job[field] === "string") ||
      !["department", "posted_at", "salary", "region_lock", "company_domain", "email_pattern"].every(
        (field) => isStringOrNull(job[field]),
      ) ||
      !["years_min", "years_max"].every((field) => isNumberOrNull(job[field])) ||
      typeof job.india !== "boolean" ||
      typeof job.eligible !== "boolean" ||
      !isNumber(job.match_score) ||
      !Array.isArray(job.points) ||
      !isRecord(job.quality) ||
      !isNumberOrNull(job.quality.days_open) ||
      typeof job.quality.days_open_basis !== "string" ||
      !isNumberOrNull(job.quality.repost_count) ||
      (job.quality.always_open !== null && typeof job.quality.always_open !== "boolean") ||
      !isNumber(job.quality.description_specificity) ||
      typeof job.quality.description_specificity_method !== "string" ||
      !isRecord(job.quality.company_posting_velocity) ||
      !isNumber(job.quality.company_posting_velocity.current) ||
      !isNumberOrNull(job.quality.company_posting_velocity.historical_median) ||
      !isNumberOrNull(job.quality.company_posting_velocity.ratio) ||
      typeof job.quality.company_posting_velocity.status !== "string" ||
      !isNumber(job.quality.history_days) ||
      typeof job.quality.verdict !== "string" ||
      (job.salary_parsed !== null && !isSalaryBand(job.salary_parsed)) ||
      job.points.some(
        (point) =>
          !isRecord(point) ||
          typeof point.label !== "string" ||
          typeof point.country !== "string" ||
          typeof point.lat !== "number" ||
          typeof point.lon !== "number" ||
          (point.approximate !== undefined && typeof point.approximate !== "boolean"),
      )
    ) {
      throw new Error(`jobs.json is malformed: ${job.title} has invalid ranking or map evidence`)
    }
  })
  if (
    !isRecord(health) ||
    typeof health.generated_at !== "string" ||
    !isNumericRecord(health.counts) ||
    !isNumericRecord(health.by_source)
  ) {
    throw new Error("health.json is malformed: build status is incomplete")
  }
  if (
    !isRecord(profile) ||
    typeof profile.portfolio !== "string" ||
    !Array.isArray(profile.strengths) ||
    profile.strengths.some((strength) => typeof strength !== "string")
  ) {
    throw new Error("profile.json is malformed: portfolio or profile strengths are missing")
  }
  if (!isRecord(idf) || Object.values(idf).some((value) => typeof value !== "number")) {
    throw new Error("idf.json is malformed: expected a numeric term index")
  }
  if (!isRecord(world) || world.type !== "FeatureCollection" || !Array.isArray(world.features)) {
    throw new Error("world.json is malformed: expected a GeoJSON FeatureCollection")
  }
  world.features.forEach((feature, index) => {
    const geometryValid =
      isRecord(feature) &&
      isRecord(feature.geometry) &&
      ((feature.geometry.type === "Polygon" && isPolygon(feature.geometry.coordinates)) ||
        (feature.geometry.type === "MultiPolygon" &&
          Array.isArray(feature.geometry.coordinates) &&
          feature.geometry.coordinates.every(isPolygon)))
    if (
      !isRecord(feature) ||
      !isRecord(feature.properties) ||
      typeof feature.properties.name !== "string" ||
      typeof feature.properties.iso !== "string" ||
      !geometryValid
    ) {
      throw new Error(`world.json is malformed: feature ${index + 1} has invalid geometry`)
    }
  })
}

export async function loadBundle(): Promise<Bundle> {
  const [data, health, profile, idf, world, insights, news, trends, relocation, benchmarks, company] =
    await Promise.all([
      grab<Dataset>("jobs.json"),
      grab<Health>("health.json"),
      grab<Profile>("profile.json"),
      grab<Record<string, number>>("idf.json"),
      grab<GeoJSON>("world.json"),
      maybe<Advisor["insights"]>("insights.json"),
      maybe<Advisor["news"]>("news.json"),
      maybe<Advisor["trends"]>("trends.json"),
      maybe<Advisor["relocation"]>("relocation.json"),
      maybe<Benchmarks>("benchmarks.json"),
      maybe<{ companies: Record<string, CompanyDossier> }>("company.json"),
    ])
  validateCore(data, health, profile, idf, world)
  const safeInsights = checkedOptional(insights, "insights.json", isInsights)
  const safeNews = checkedOptional(news, "news.json", isNews)
  const safeTrends = checkedOptional(trends, "trends.json", isTrends)
  const safeRelocation = checkedOptional(relocation, "relocation.json", isRelocation)
  const safeBenchmarks = checkedOptional(benchmarks, "benchmarks.json", isBenchmarks)
  const safeCompany = checkedOptional(company, "company.json", isDossiers)
  const optional = [safeInsights, safeNews, safeTrends, safeRelocation, safeBenchmarks, safeCompany]
  return {
    data,
    health,
    profile,
    idf,
    world,
    benchmarks: safeBenchmarks.value,
    dossiers: safeCompany.value?.companies ?? {},
    unavailable: optional.flatMap((result) => (result.error ? [result.error] : [])),
    advisor: {
      insights: safeInsights.value,
      news: safeNews.value,
      trends: safeTrends.value,
      relocation: safeRelocation.value,
    },
  }
}

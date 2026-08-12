import type { Dataset, Health, Profile } from "./types"
import type { Advisor } from "@/components/AdvisorView"

/** Everything the nightly crawl produced, fetched once and shared. */
export interface Bundle {
  data: Dataset
  health: Health
  profile: Profile
  idf: Record<string, number>
  world: GeoJSON
  advisor: Advisor
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

/** Optional files: a build that predates a feature must not break the app. */
async function maybe<T>(path: string): Promise<T | undefined> {
  try {
    return await grab<T>(path)
  } catch {
    return undefined
  }
}

async function grab<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${path}`, { cache: "no-cache" })
  if (!res.ok) throw new Error(`${path} failed: HTTP ${res.status}`)
  return (await res.json()) as T
}

export async function loadBundle(): Promise<Bundle> {
  const [data, health, profile, idf, world, insights, news, trends, relocation] =
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
    ])
  return { data, health, profile, idf, world, advisor: { insights, news, trends, relocation } }
}

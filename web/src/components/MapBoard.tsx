import { useEffect, useMemo, useRef, useState } from "react"
import type { GeoJSON } from "@/lib/data"
import type { Job, Place } from "@/lib/types"
import { PRESETS, WORLD_W, clampView, pathsFor, project, viewBoxOf, type View } from "@/lib/projection"

interface Props {
  world: GeoJSON
  places: Place[]
  jobs: Job[]
  selectedPlace: string | null
  onSelectPlace: (label: string | null) => void
  eligibleOnly: boolean
}

export function MapBoard({ world, places, jobs, selectedPlace, onSelectPlace, eligibleOnly }: Props) {
  const [view, setView] = useState<View>(PRESETS.india)
  const [aspect, setAspect] = useState(2)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)

  useEffect(() => {
    const node = svgRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setAspect(width / height)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const countries = useMemo(
    () => pathsFor(world).sort((a, b) => (a.iso === "IN" ? 1 : b.iso === "IN" ? -1 : 0)),
    [world],
  )

  // The dots are counted from the roles actually on the board, not from the
  // precomputed totals in places.json. Those totals are the whole corpus, so a
  // rail filtered to twelve roles used to sit beside a dot claiming twenty-nine
  // in one city. places.json still supplies the coordinates and the labels.
  const live = useMemo(() => {
    const counts = new Map<string, { jobs: number; eligible: number }>()
    for (const job of jobs) {
      for (const point of job.points) {
        const row = counts.get(point.label) ?? { jobs: 0, eligible: 0 }
        row.jobs += 1
        if (job.eligible) row.eligible += 1
        counts.set(point.label, row)
      }
    }
    return places.map((p) => ({ ...p, ...(counts.get(p.label) ?? { jobs: 0, eligible: 0 }) }))
  }, [places, jobs])

  const withJobs = useMemo(() => {
    const set = new Set<string>()
    for (const place of live) if (place.jobs > 0) set.add(place.country)
    return set
  }, [live])

  const visible = useMemo(
    () => live.filter((p) => (eligibleOnly ? p.eligible > 0 : p.jobs > 0)),
    [live, eligibleOnly],
  )

  const maxJobs = useMemo(
    () => Math.max(1, ...visible.map((p) => (eligibleOnly ? p.eligible : p.jobs))),
    [visible, eligibleOnly],
  )

  const remote = useMemo(() => {
    const rows = jobs.filter((j) => j.workplace === "remote" && (!eligibleOnly || j.eligible))
    return {
      count: rows.length,
      companies: new Set(rows.map((j) => j.company)).size,
      best: rows.reduce((max, j) => Math.max(max, j.match_score), 0),
    }
  }, [jobs, eligibleOnly])

  const rankedPlaces = useMemo(
    () =>
      [...visible]
        .sort((a, b) => (eligibleOnly ? b.eligible - a.eligible : b.jobs - a.jobs))
        .slice(0, 4),
    [visible, eligibleOnly],
  )

  const selected = useMemo(
    () => live.find((place) => place.label === selectedPlace) ?? null,
    [live, selectedPlace],
  )

  function choosePlace(place: Place & { jobs: number; eligible: number }) {
    const on = selectedPlace === place.label
    if (!on) {
      const [cx, cy] = project(place.lon, place.lat)
      setView((current) => clampView({ ...current, zoom: Math.max(current.zoom, 7.2), cx, cy }, aspect))
    }
    onSelectPlace(on ? null : place.label)
  }

  useEffect(() => {
    const node = svgRef.current
    if (!node) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      setView((current) => {
        const factor = Math.exp(-event.deltaY * 0.0016)
        return clampView({ ...current, zoom: current.zoom * factor })
      })
    }

    node.addEventListener("wheel", onWheel, { passive: false })
    return () => node.removeEventListener("wheel", onWheel)
  }, [])

  function startDrag(event: React.PointerEvent) {
    drag.current = { x: event.clientX, y: event.clientY, cx: view.cx, cy: view.cy }
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }

  function moveDrag(event: React.PointerEvent) {
    const origin = drag.current
    if (!origin || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const scale = WORLD_W / view.zoom / rect.width
    setView((current) =>
      clampView(
        {
          ...current,
          cx: origin.cx - (event.clientX - origin.x) * scale,
          cy: origin.cy - (event.clientY - origin.y) * scale,
        },
        aspect,
      ),
    )
  }

  const endDrag = () => {
    drag.current = null
  }

  // Everything drawn on top of the map is sized in viewBox units, which the
  // browser then scales by the zoom factor. Dividing by sqrt(zoom) looked
  // right at 1x and turned "Delhi NCR" into a banner across half of India at
  // 6.5x. Screen-constant size means dividing by the zoom exactly.
  const k = 1 / view.zoom

  const r = (place: Place) => {
    const n = eligibleOnly ? place.eligible : place.jobs
    return (3.5 + Math.sqrt(n / maxJobs) * 8) * k
  }

  const labelSize = 11 * k
  const countSize = 9.5 * k

  return (
    <div className="stage">
      <div className="map-hud">
        <div>
          <div className="map-kicker">World map</div>
          <div className="map-title">Political map, India view</div>
        </div>
        <div className="map-metrics">
          <span>{visible.length} cities</span>
          <span>{withJobs.size} countries</span>
          <span>{remote.count} remote</span>
        </div>
      </div>

      <svg
        ref={svgRef}
        className="map-svg"
        viewBox={viewBoxOf(view, aspect)}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        role="group"
        aria-label="Interactive map of open design roles. The job list and city buttons provide the same filtering without using the map."
      >
        <defs>
          <radialGradient id="job-dot" cx="38%" cy="32%" r="70%">
            <stop offset="0%" stopColor="var(--accent-ink)" stopOpacity="0.95" />
            <stop offset="38%" stopColor="var(--accent-text)" />
            <stop offset="100%" stopColor="var(--accent)" />
          </radialGradient>
          <filter id="job-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation={2.8 * k} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g>
          {countries.map((country) => (
            <path
              key={country.iso + country.name}
              className={`country${withJobs.has(country.iso) ? " has" : ""}${country.iso === "IN" ? " india" : ""}`}
              d={country.d}
            />
          ))}
        </g>

        <g>
          {visible.map((place) => {
            const [x, y] = project(place.lon, place.lat)
            const radius = r(place)
            const on = selectedPlace === place.label
            const count = eligibleOnly ? place.eligible : place.jobs
            const hot = count >= maxJobs * 0.55
            return (
              <g key={place.label} className={on ? "place on" : hot ? "place hot" : "place"}>
                <circle className="place-pulse" cx={x} cy={y} r={radius * (on ? 3.4 : 2.5)} />
                {on && <circle className="place-halo" cx={x} cy={y} r={radius * 2.6} />}
                <circle
                  cx={x}
                  cy={y}
                  r={radius}
                  fill="none"
                  stroke="var(--bg)"
                  strokeWidth={1.2 * k}
                  opacity={0.9}
                />
                <circle
                  className={`place-dot${place.eligible === 0 ? " none" : ""}`}
                  cx={x}
                  cy={y}
                  r={radius}
                  opacity={on ? 1 : 0.85}
                  filter={place.eligible === 0 ? undefined : "url(#job-glow)"}
                />
                <circle
                  className="place-hit"
                  role="button"
                  tabIndex={0}
                  aria-label={`${place.label}: ${place.jobs} roles, ${place.eligible} you can take`}
                  aria-pressed={on}
                  cx={x}
                  cy={y}
                  r={Math.max(radius * 1.9, 10 * k)}
                  onClick={(event) => {
                    event.stopPropagation()
                    choosePlace(place)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    event.stopPropagation()
                    choosePlace(place)
                  }}
                >
                  <title>{`${place.label} — ${place.jobs} roles, ${place.eligible} you can take`}</title>
                </circle>
                {(view.zoom > 2.2 || count >= maxJobs * 0.25 || on) && (
                  <>
                    <text
                      className="place-label"
                      x={x + radius + 4 * k}
                      y={y + 1 * k}
                      style={{ fontSize: labelSize, strokeWidth: 3 * k }}
                    >
                      {place.label}
                    </text>
                    <text
                      className="place-count"
                      x={x + radius + 4 * k}
                      y={y + 1 * k + labelSize * 1.05}
                      style={{ fontSize: countSize, strokeWidth: 3 * k }}
                    >
                      {count} {count === 1 ? "role" : "roles"}
                    </text>
                  </>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      <div className="map-places" aria-label="Top cities on this board">
        {rankedPlaces.map((place) => {
          const count = eligibleOnly ? place.eligible : place.jobs
          const on = selectedPlace === place.label
          return (
            <button
              key={place.label}
              className={on ? "on" : ""}
              onClick={() => choosePlace(place)}
            >
              <span>
                <strong>{place.label}</strong>
                <small>{place.eligible} you can take</small>
              </span>
              <b>{count}</b>
            </button>
          )
        })}
      </div>

      <div className="remote-card">
        <h4>Remote</h4>
        <div className="remote-big">{remote.count}</div>
        <p>
          {remote.companies} companies, nothing to plot. Remote roles have no city, so they live
          here rather than being invented onto a map pin.
        </p>
        <button
          className="btn btn-sm btn-full"
          style={{ marginTop: 9 }}
          onClick={() => onSelectPlace(selectedPlace === "__remote__" ? null : "__remote__")}
        >
          {selectedPlace === "__remote__" ? "Clear filter" : "Show remote only"}
        </button>
      </div>

      {selected && (
        <div className="map-selection">
          <div className="map-kicker">Selected city</div>
          <strong>{selected.label}</strong>
          <span>
            {selected.jobs} roles, {selected.eligible} you can take
          </span>
        </div>
      )}

      <div className="map-legend">
        <div>Dot size = open roles</div>
        <div>Grey = none you can take</div>
        <div>India boundary shown from India view</div>
        <div>Scroll to zoom, drag to pan</div>
      </div>

      <div className="map-controls">
        <button title="India" onClick={() => setView(PRESETS.india)}>
          IN
        </button>
        <button title="World" onClick={() => setView(PRESETS.world)}>
          ⌂
        </button>
        <button title="Zoom in" onClick={() => setView((v) => clampView({ ...v, zoom: v.zoom * 1.5 }, aspect))}>
          +
        </button>
        <button title="Zoom out" onClick={() => setView((v) => clampView({ ...v, zoom: v.zoom / 1.5 }, aspect))}>
          −
        </button>
      </div>
    </div>
  )
}

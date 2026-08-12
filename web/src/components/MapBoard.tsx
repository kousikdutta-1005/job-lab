import { useEffect, useMemo, useRef, useState } from "react"
import type { GeoJSON } from "@/lib/data"
import type { Job, Place } from "@/lib/types"
import { PRESETS, clampView, pathsFor, project, viewBoxOf, type View } from "@/lib/projection"

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
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)

  const countries = useMemo(() => pathsFor(world), [world])

  const withJobs = useMemo(() => {
    const set = new Set<string>()
    for (const place of places) if (place.jobs > 0) set.add(place.country)
    return set
  }, [places])

  const visible = useMemo(
    () => places.filter((p) => (eligibleOnly ? p.eligible > 0 : p.jobs > 0)),
    [places, eligibleOnly],
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

  useEffect(() => {
    const node = svgRef.current
    if (!node) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      setView((current) => {
        const factor = Math.exp(-event.deltaY * 0.0016)
        const next = clampView({ ...current, zoom: current.zoom * factor })
        return next
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
    const scale = 1000 / view.zoom / rect.width
    setView((current) =>
      clampView({
        ...current,
        cx: origin.cx - (event.clientX - origin.x) * scale,
        cy: origin.cy - (event.clientY - origin.y) * scale,
      }),
    )
  }

  const endDrag = () => {
    drag.current = null
  }

  // Points shrink as you zoom in, so a dense cluster resolves into separate
  // cities instead of one growing blob.
  const r = (place: Place) => {
    const n = eligibleOnly ? place.eligible : place.jobs
    const base = 3 + Math.sqrt(n / maxJobs) * 9
    return base / Math.sqrt(view.zoom)
  }

  const labelSize = 10 / Math.sqrt(view.zoom)

  return (
    <div className="stage">
      <svg
        ref={svgRef}
        className="map-svg"
        viewBox={viewBoxOf(view)}
        preserveAspectRatio="xMidYMid slice"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        role="img"
        aria-label="Map of open design roles"
      >
        <g>
          {countries.map((country) => (
            <path
              key={country.iso + country.name}
              className={`country${withJobs.has(country.iso) ? " has" : ""}`}
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
            return (
              <g key={place.label}>
                {on && <circle className="place-halo" cx={x} cy={y} r={radius * 2.6} />}
                <circle
                  className={`place-dot${place.eligible === 0 ? " none" : ""}`}
                  cx={x}
                  cy={y}
                  r={radius}
                  opacity={on ? 1 : 0.85}
                />
                <circle
                  className="place-hit"
                  cx={x}
                  cy={y}
                  r={Math.max(radius * 1.8, 9 / view.zoom)}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelectPlace(on ? null : place.label)
                  }}
                >
                  <title>{`${place.label} — ${place.jobs} roles, ${place.eligible} you can take`}</title>
                </circle>
                {(view.zoom > 2.2 || count >= maxJobs * 0.25 || on) && (
                  <>
                    <text
                      className="place-label"
                      x={x + radius + 3 / view.zoom}
                      y={y - 1 / view.zoom}
                      style={{ fontSize: labelSize }}
                    >
                      {place.label}
                    </text>
                    <text
                      className="place-count"
                      x={x + radius + 3 / view.zoom}
                      y={y + labelSize}
                      style={{ fontSize: labelSize * 0.85 }}
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

      <div className="map-legend">
        <div>Dot size = open roles</div>
        <div>Grey = none you can take</div>
        <div>Scroll to zoom, drag to pan</div>
      </div>

      <div className="map-controls">
        <button title="India" onClick={() => setView(PRESETS.india)}>
          IN
        </button>
        <button title="World" onClick={() => setView(PRESETS.world)}>
          ⌂
        </button>
        <button title="Zoom in" onClick={() => setView((v) => clampView({ ...v, zoom: v.zoom * 1.5 }))}>
          +
        </button>
        <button title="Zoom out" onClick={() => setView((v) => clampView({ ...v, zoom: v.zoom / 1.5 }))}>
          −
        </button>
      </div>
    </div>
  )
}

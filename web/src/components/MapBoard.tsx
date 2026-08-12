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
      <svg
        ref={svgRef}
        className="map-svg"
        viewBox={viewBoxOf(view, aspect)}
        preserveAspectRatio="xMidYMid meet"
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
                />
                <circle
                  className="place-hit"
                  cx={x}
                  cy={y}
                  r={Math.max(radius * 1.9, 10 * k)}
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

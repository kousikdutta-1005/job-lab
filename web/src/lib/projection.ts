/**
 * Drawing the world without a map library.
 *
 * Equirectangular, because at this scale it is the projection that keeps India
 * and the US legible at the same time without the polar distortion of Mercator
 * making Greenland the largest employer on the board.
 */

import type { GeoJSON } from "./data"

export interface View {
  zoom: number
  cx: number
  cy: number
}

export const WORLD_W = 1000
export const WORLD_H = 500

/** Longitude/latitude to unprojected SVG space. */
export function project(lon: number, lat: number): [number, number] {
  return [((lon + 180) / 360) * WORLD_W, ((90 - lat) / 180) * WORLD_H]
}

/**
 * The viewBox has to match the shape of the element or the framing lies.
 *
 * A fixed 2:1 box in a 1.3:1 panel meant "zoom to India" put India in the
 * bottom-right corner with an ocean of empty space above it. Deriving height
 * from the measured aspect ratio keeps the centre actually centred at every
 * zoom level and window size.
 */
export function viewBoxOf(view: View, aspect = 2): string {
  const w = WORLD_W / view.zoom
  const h = w / Math.max(0.2, aspect)
  return `${view.cx - w / 2} ${view.cy - h / 2} ${w} ${h}`
}

export function clampView(view: View, aspect = 2): View {
  const zoom = Math.min(14, Math.max(1, view.zoom))
  const w = WORLD_W / zoom
  const h = w / Math.max(0.2, aspect)
  // Allow a little overscroll past the poles so a city near the edge can still
  // be centred, but never let the world slide entirely out of frame.
  const padY = Math.min(h / 2, WORLD_H / 4)
  return {
    zoom,
    cx: Math.min(WORLD_W - w / 2, Math.max(w / 2, view.cx)),
    cy: Math.min(WORLD_H + padY - h / 2, Math.max(h / 2 - padY, view.cy)),
  }
}

/** One `d` attribute per country. Built once and memoised by the caller. */
export function pathsFor(world: GeoJSON): Array<{ iso: string; name: string; d: string }> {
  const out: Array<{ iso: string; name: string; d: string }> = []

  for (const feature of world.features) {
    const polygons =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates

    let d = ""
    for (const polygon of polygons) {
      for (const ring of polygon) {
        if (ring.length < 4) continue
        ring.forEach(([lon, lat], index) => {
          const [x, y] = project(lon, lat)
          d += `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`
        })
        d += "Z"
      }
    }
    if (d) out.push({ iso: feature.properties.iso, name: feature.properties.name, d })
  }

  return out
}

export const PRESETS: Record<string, View> = {
  world: { zoom: 1, cx: WORLD_W / 2, cy: WORLD_H / 2 },
  india: { zoom: 6.4, cx: project(78.5, 20)[0], cy: project(78.5, 20)[1] },
  europe: { zoom: 5.5, cx: project(10, 50)[0], cy: project(10, 50)[1] },
  usa: { zoom: 4, cx: project(-98, 39)[0], cy: project(-98, 39)[1] },
  apac: { zoom: 3, cx: project(110, 5)[0], cy: project(110, 5)[1] },
}

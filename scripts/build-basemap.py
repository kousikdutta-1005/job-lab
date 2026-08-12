#!/usr/bin/env python3
"""Turn Natural Earth country outlines into a compact basemap for the board.

Runs once, commits its output. The map on the site is inline SVG paths drawn
from this file, which is why there is no Mapbox token, no tile server, no
attribution overlay and no per-view cost. The trade is that the geometry has to
be small enough to ship, so it is simplified hard: a world map at 900 pixels
wide cannot show a coastline detail finer than about ten kilometres anyway.

Source: Natural Earth 1:110m Admin 0 Countries, public domain.
https://www.naturalearthdata.com/about/terms-of-use/
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

SOURCE = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
    "master/geojson/ne_110m_admin_0_countries.geojson"
)

OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data" / "world.json"

# Degrees. At 1:110m the source already carries more detail than a world view
# can resolve, so snapping to this grid is invisible and roughly halves the file.
PRECISION = 2

# Square degrees. Drops specks that render as sub-pixel noise but cost bytes.
MIN_RING_AREA = 0.6


def ring_area(ring: list[list[float]]) -> float:
    """Shoelace area, unsigned. Only used to decide whether a ring is visible."""
    total = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[i + 1][0], ring[i + 1][1]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2.0


def simplify_ring(ring: list) -> list | None:
    snapped: list[list[float]] = []
    for point in ring:
        x = round(float(point[0]), PRECISION)
        y = round(float(point[1]), PRECISION)
        if not snapped or snapped[-1] != [x, y]:
            snapped.append([x, y])

    if len(snapped) < 4:
        return None
    if snapped[0] != snapped[-1]:
        snapped.append(snapped[0])
    if len(snapped) < 4 or ring_area(snapped) < MIN_RING_AREA:
        return None
    return snapped


def simplify_geometry(geometry: dict) -> dict | None:
    kind = geometry.get("type")

    if kind == "Polygon":
        rings = [r for r in (simplify_ring(ring) for ring in geometry["coordinates"]) if r]
        return {"type": "Polygon", "coordinates": rings} if rings else None

    if kind == "MultiPolygon":
        polygons = []
        for polygon in geometry["coordinates"]:
            rings = [r for r in (simplify_ring(ring) for ring in polygon) if r]
            if rings:
                polygons.append(rings)
        return {"type": "MultiPolygon", "coordinates": polygons} if polygons else None

    return None


def main() -> int:
    print(f"fetching {SOURCE}")
    request = urllib.request.Request(SOURCE, headers={"User-Agent": "job-lab/0.1"})
    with urllib.request.urlopen(request, timeout=90) as response:
        source = json.load(response)

    before = len(json.dumps(source))
    features = []

    for feature in source.get("features", []):
        properties = feature.get("properties", {}) or {}
        geometry = simplify_geometry(feature.get("geometry") or {})
        if not geometry:
            continue
        name = properties.get("NAME") or properties.get("ADMIN") or ""
        iso = properties.get("ISO_A2_EH") or properties.get("ISO_A2") or ""
        # Antarctica is a third of the visual area and never has a job on it.
        if iso == "AQ" or name == "Antarctica":
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {"name": name, "iso": iso},
                "geometry": geometry,
            }
        )

    out = {"type": "FeatureCollection", "features": features}
    payload = json.dumps(out, separators=(",", ":"))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(payload)

    print(f"  {len(features)} countries")
    print(f"  {before / 1024:.0f} KB source -> {len(payload) / 1024:.0f} KB shipped")
    print(f"  wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

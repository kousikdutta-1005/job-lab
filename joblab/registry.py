"""Which company is on which ATS, worked out once and remembered.

The registry file only needs a company name. This module finds the board by
probing each supported platform for a slug derived from that name, then commits
the answer to `data/ats-map.json` so the next run costs nothing. Detections are
re-checked occasionally, because companies do migrate between platforms.
"""

from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

import yaml

from .sources.ats import (
    ATS_PLATFORMS,
    discover_boards_from_site,
    probe,
    slug_candidates,
    verify_board,
)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
REGISTRY_PATH = DATA_DIR / "companies.yaml"
ATS_MAP_PATH = DATA_DIR / "ats-map.json"

# How long a detection is trusted. Long, because migrations are rare and a wrong
# cache costs one company for a few weeks rather than breaking the board.
DETECTION_TTL_DAYS = 30
# How long a failure is trusted, before trying again. Short, because a company
# with no board today may publish one next month.
MISS_TTL_DAYS = 7


@dataclass
class Company:
    name: str
    domain: str | None = None
    tags: tuple[str, ...] = ()
    ats: str | None = None
    slug: str | None = None
    aliases: tuple[str, ...] = ()

    @property
    def key(self) -> str:
        return self.name.strip().lower()


def load_registry(path: Path = REGISTRY_PATH) -> list[Company]:
    raw = yaml.safe_load(path.read_text()) or {}
    out: list[Company] = []
    for row in raw.get("companies", []) or []:
        if isinstance(row, str):
            out.append(Company(name=row))
            continue
        name = (row.get("name") or "").strip()
        if not name:
            continue
        out.append(
            Company(
                name=name,
                domain=(row.get("domain") or None),
                tags=tuple(row.get("tags") or ()),
                ats=(row.get("ats") or None),
                slug=(row.get("slug") or None),
                aliases=tuple(row.get("aliases") or ()),
            )
        )
    return out


def load_ats_map(path: Path = ATS_MAP_PATH) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def save_ats_map(mapping: dict, path: Path = ATS_MAP_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(mapping, indent=2, sort_keys=True) + "\n")


def _is_fresh(entry: dict) -> bool:
    checked = entry.get("checked_at", 0)
    ttl_days = DETECTION_TTL_DAYS if entry.get("ats") else MISS_TTL_DAYS
    return (time.time() - checked) < ttl_days * 86400


def detect_one(company: Company) -> dict:
    """Find the board for one company, then prove it belongs to them.

    Detection without verification is worse than no detection: it fills the
    board with another company's jobs under a name you trust. Every candidate
    has to survive `verify_board` before it is recorded.

    Two strategies, best first. A link on the company's own careers page is
    authoritative and catches tokens no one would guess. Name-derived slugs are
    the fallback and are right surprisingly often.
    """
    if company.ats and company.slug:
        verdict = verify_board(company.ats, company.slug, company.name, company.domain, company.tags, company.aliases)
        if verdict["ok"]:
            return {
                "ats": company.ats,
                "slug": company.slug,
                "checked_at": time.time(),
                "confidence": verdict["confidence"],
                "how": f"pinned in registry; {verdict['why']}",
            }
        return {
            "ats": None,
            "slug": None,
            "checked_at": time.time(),
            "confidence": "none",
            "how": f"pinned board rejected: {verdict['why']}",
        }

    rejected: list[str] = []

    def try_candidate(ats_name: str, slug: str, how: str) -> dict | None:
        if not slug or not probe(ats_name, slug):
            return None
        verdict = verify_board(ats_name, slug, company.name, company.domain, company.tags, company.aliases)
        if verdict["ok"]:
            return {
                "ats": ats_name,
                "slug": slug,
                "checked_at": time.time(),
                "confidence": verdict["confidence"],
                "how": f"{how}; {verdict['why']}",
            }
        rejected.append(f"{ats_name}/{slug}: {verdict['why']}")
        return None

    if company.domain:
        for ats_name, slug in discover_boards_from_site(company.domain):
            if company.ats and company.ats != ats_name:
                continue
            hit = try_candidate(ats_name, slug, "linked from careers page")
            if hit:
                return hit

    candidates = [company.slug] if company.slug else slug_candidates(company.name, company.domain)
    for ats_name, _, _ in ATS_PLATFORMS:
        if company.ats and company.ats != ats_name:
            continue
        for slug in candidates:
            hit = try_candidate(ats_name, slug, "slug guessed from name")
            if hit:
                return hit

    return {
        "ats": None,
        "slug": None,
        "checked_at": time.time(),
        "confidence": "none",
        "how": "; ".join(rejected[:3]) if rejected else "no public board found",
    }


def resolve_boards(
    companies: list[Company], *, workers: int = 8, force: bool = False
) -> tuple[dict, dict]:
    """Return (ats_map, stats), probing only the entries that need it."""
    mapping = load_ats_map()
    todo = [
        c
        for c in companies
        if force
        or not _is_fresh(mapping.get(c.key, {}))
        or (c.ats and mapping.get(c.key, {}).get("ats") != c.ats)
        or (c.slug and mapping.get(c.key, {}).get("slug") != c.slug)
    ]

    stats = {
        "total": len(companies),
        "cached": len(companies) - len(todo),
        "probed": len(todo),
        "found": 0,
        "missing": 0,
    }

    if todo:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(detect_one, c): c for c in todo}
            for future in as_completed(futures):
                company = futures[future]
                try:
                    mapping[company.key] = future.result()
                except Exception as exc:  # noqa: BLE001 - one bad probe must not stop the crawl
                    mapping[company.key] = {
                        "ats": None,
                        "slug": None,
                        "checked_at": time.time(),
                        "how": f"probe error: {type(exc).__name__}",
                    }

    for company in companies:
        entry = mapping.get(company.key, {})
        # Carry the human-readable name and domain so the map is readable on its own.
        entry["name"] = company.name
        if company.domain:
            entry["domain"] = company.domain
        mapping[company.key] = entry
        if entry.get("ats"):
            stats["found"] += 1
        else:
            stats["missing"] += 1

    save_ats_map(mapping)
    return mapping, stats

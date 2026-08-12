"""Turning a free-text location into something you can filter on.

Job boards write location as prose: "Bengaluru, Karnataka, India (Hybrid)",
"Remote - US", "Multiple locations". This module reduces that to a workplace
type, a set of city labels, and an honest eligibility verdict.
"""

from __future__ import annotations

import re

from .config import (
    GLOBAL_REMOTE_TOKENS,
    HYBRID_TOKENS,
    INDIA_CITIES,
    INDIA_TOKENS,
    ONSITE_TOKENS,
    REMOTE_TOKENS,
    detect_region_lock,
)
from .geocode import locate

_SPLIT_RE = re.compile(r"\s*(?:;|\||/|\bor\b|\band\b|,\s*(?=[A-Z]))\s*")


def _norm(text: str) -> str:
    t = (text or "").lower()
    t = t.replace("\u2013", "-").replace("\u2014", "-")
    return re.sub(r"\s+", " ", t).strip()


def workplace_type(location: str, description: str = "") -> str:
    """remote | hybrid | onsite | unknown."""
    loc = _norm(location)
    head = _norm(description[:1500])

    if any(tok in loc for tok in HYBRID_TOKENS):
        return "hybrid"
    if any(tok in loc for tok in REMOTE_TOKENS):
        # "Remote or Bengaluru" is really hybrid-ish, but the board treats an
        # explicit remote token as remote and lets the city list carry the rest.
        return "remote"
    if any(tok in loc for tok in ONSITE_TOKENS):
        return "onsite"

    if any(tok in head for tok in ("fully remote", "remote-first", "work from anywhere")):
        return "remote"
    if "hybrid" in head:
        return "hybrid"
    if loc:
        return "onsite"
    return "unknown"


def india_cities(location: str) -> list[str]:
    """Canonical Indian city labels mentioned in the location string."""
    loc = _norm(location)
    found: list[str] = []
    for label, aliases in INDIA_CITIES.items():
        if any(re.search(rf"\b{re.escape(a)}\b", loc) for a in aliases):
            found.append(label)
    return found


def is_india(location: str) -> bool:
    loc = _norm(location)
    if india_cities(location):
        return True
    return any(re.search(rf"\b{re.escape(tok.strip())}\b", loc) for tok in INDIA_TOKENS if tok.strip())


def is_global_remote(location: str, description: str = "") -> bool:
    blob = _norm(location) + " " + _norm(description[:4000])
    return any(tok in blob for tok in GLOBAL_REMOTE_TOKENS)


def classify(location: str, description: str = "") -> dict:
    """Full location verdict for one posting.

    `eligible` answers one question only: could a designer living in India
    realistically take this job? Getting that right is the entire point of the
    board, and the naive version got it wrong in the most common case of all.

    "Remote" almost never means remote from anywhere. A posting that says
    "Remote — United States", or "San Francisco, CA (Remote)", is offering to
    let an American work from home; it is not offering a job to someone in
    Bengaluru. So a remote role whose location names a country other than India
    is treated as remote *within that country* unless it explicitly says
    otherwise. Reading the named place is far more reliable than waiting for a
    job description to spell out a restriction it usually assumes.
    """
    workplace = workplace_type(location, description)
    cities = india_cities(location)
    india = is_india(location)

    # The location field is authoritative; the description is boilerplate.
    #
    # Reading them as equals produced the worst kind of wrong answer. Linear's
    # posting says "North America (Remote)" in its location and describes the
    # company as remote-first in its body, and Vercel's says "Hybrid - San
    # Francisco" while the body talks about working from anywhere. Both were
    # being marked open worldwide, which is exactly the mistake this whole
    # module exists to prevent. So a lock or a worldwide claim written in the
    # location wins outright, and the description is only consulted when the
    # location says nothing useful.
    location_lock = detect_region_lock(location)
    location_worldwide = is_global_remote(location)
    described_lock = detect_region_lock(location, description[:8000])
    described_worldwide = is_global_remote(location, description)

    points = locate(location)
    countries = {p.get("country") for p in points if p.get("country")}
    foreign = countries - {"IN"}

    lock = location_lock or described_lock

    if india:
        eligible, reason = True, "Based in India"
    elif workplace != "remote":
        eligible, reason = False, "On-site outside India"
    elif location_lock in ("APAC", "SG"):
        eligible, reason = True, f"Remote within {location_lock}, which includes India"
    elif location_lock:
        eligible, reason = False, f"Remote but restricted to {location_lock}"
    elif location_worldwide:
        eligible, reason = True, "Remote, open worldwide"
    elif foreign:
        named = ", ".join(sorted(foreign))
        eligible, reason = False, f"Remote within {named} — the role is tied to that country"
        lock = lock or sorted(foreign)[0]
    elif described_lock in ("APAC", "SG"):
        eligible, reason = True, f"Remote within {described_lock}, which includes India"
    elif described_lock:
        eligible, reason = False, f"Remote but restricted to {described_lock}"
    elif described_worldwide:
        eligible, reason = True, "Remote, open worldwide"
    else:
        eligible, reason = True, "Remote, no stated region restriction"

    return {
        "workplace": workplace,
        "cities": cities,
        "india": india,
        "region_lock": lock,
        "eligible": eligible,
        "eligibility_reason": reason,
    }

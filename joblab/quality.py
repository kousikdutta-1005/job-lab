"""Signals that help avoid stale or low-intent job postings.

The score is deliberately conservative. History is only useful when it contains
per-job keys; older snapshots in this repo stored company aggregates only, so
those fields return "not enough history" instead of pretending to know.
"""

from __future__ import annotations

import json
import re
import statistics
from datetime import date
from pathlib import Path

from .models import Job
from .trends import HISTORY_DIR

_SPECIFIC_PATTERNS = (
    r"\b(figma|react|typescript|swift|kotlin|ios|android|accessibility|wcag|analytics|sql|api)\b",
    r"\b(payments?|checkout|dashboard|platform|marketplace|developer tools?|design system)\b",
    r"\b\d+(\.\d+)?\s*(million|billion|k|m|users|customers|countries|markets|teams?)\b",
    r"\b(team|product|platform|growth|consumer|enterprise|mobile|web|research)\s+team\b",
)
_SPECIFIC_RE = [re.compile(p, re.I) for p in _SPECIFIC_PATTERNS]
_GENERIC_RE = re.compile(
    r"\b(fast[- ]paced|rockstar|ninja|self[- ]starter|wear many hats|dynamic environment|"
    r"excellent communication|passionate designer)\b",
    re.I,
)


def _load_history(history_dir: Path = HISTORY_DIR) -> list[dict]:
    rows = []
    if not history_dir.exists():
        return rows
    for path in sorted(history_dir.glob("*.json")):
        try:
            rows.append(json.loads(path.read_text()))
        except (OSError, json.JSONDecodeError):
            continue
    return sorted(rows, key=lambda r: r.get("date", ""))


def _job_key(job: Job) -> str:
    return f"{job.company.strip().lower()}|{job.title.strip().lower()}"


def description_specificity(text: str) -> float:
    """0-1 estimate from concrete tools, domains, teams and numeric details."""
    if not text:
        return 0.0
    window = text[:8000]
    hits = sum(1 for rx in _SPECIFIC_RE if rx.search(window))
    hit_bonus = min(0.8, hits * 0.2)
    length_bonus = min(0.2, len(window) / 5000)
    generic_penalty = min(0.3, len(_GENERIC_RE.findall(window)) * 0.1)
    return round(max(0.0, min(1.0, hit_bonus + length_bonus - generic_penalty)), 2)


def _runs(seen: list[bool]) -> int:
    count = 0
    previous = False
    for value in seen:
        if value and not previous:
            count += 1
        previous = value
    return count


def attach_quality(jobs: list[Job], *, today: date | None = None, history_dir: Path = HISTORY_DIR) -> dict:
    today = today or date.today()
    rows = _load_history(history_dir)
    keyed_rows = [r for r in rows if isinstance(r.get("job_keys"), list)]
    history_days = len(rows)

    current_counts: dict[str, int] = {}
    for job in jobs:
        current_counts[job.company] = current_counts.get(job.company, 0) + 1

    historical_counts: dict[str, list[int]] = {}
    for row in rows:
        for company, count in (row.get("per_company") or {}).items():
            historical_counts.setdefault(company, []).append(int(count or 0))

    for job in jobs:
        key = _job_key(job)
        seen = [key in set(row.get("job_keys") or []) for row in keyed_rows]
        first_seen = None
        if any(seen):
            first_seen = next(row.get("date") for row, present in zip(keyed_rows, seen) if present)

        days_open = None
        days_open_basis = "not_enough_job_history"
        # The employer's own posted date beats our first sighting whenever it
        # is older. Local history cannot predate the first crawl, so preferring
        # it reported every posting on the board as "open 0 days" — including
        # one that Workday said had been up for 392 days. Take the earlier of
        # the two: a posting seen before its stated date is a repost, and a
        # posting stated older than our history is genuinely older.
        ats_days = None
        if job.posted_at:
            try:
                ats_days = max(0, (today - date.fromisoformat(job.posted_at[:10])).days)
            except ValueError:
                ats_days = None

        seen_days = None
        if first_seen:
            try:
                seen_days = (today - date.fromisoformat(first_seen)).days
            except ValueError:
                seen_days = None

        if ats_days is not None and (seen_days is None or ats_days > seen_days):
            days_open, days_open_basis = ats_days, "ats_posted_date"
        elif seen_days is not None:
            days_open, days_open_basis = seen_days, "first_seen_in_history"

        repost_count = None
        always_open = None
        if len(keyed_rows) >= 3:
            repost_count = max(0, _runs(seen) - 1)
            always_open = bool(seen and all(seen) and len(seen) >= 14)

        counts = historical_counts.get(job.company) or []
        median = statistics.median(counts) if counts else None
        velocity = {
            "current": current_counts.get(job.company, 0),
            "historical_median": median,
            "ratio": round(current_counts.get(job.company, 0) / median, 2) if median else None,
            "status": "ok" if median else "not_enough_history",
        }

        specificity = description_specificity(job.description_text or "")
        caveats = []
        if history_days < 7 or len(keyed_rows) < 3:
            caveats.append("history is too short for repost or always-open claims")
        if days_open_basis == "ats_posted_date" and history_days < 7:
            caveats.append("age is the employer's stated posted date, not our own observation")
        if specificity < 0.35:
            caveats.append("description is fairly generic")

        job.quality = {
            "days_open": days_open,
            "days_open_basis": days_open_basis,
            "repost_count": repost_count,
            "always_open": always_open,
            "description_specificity": specificity,
            "description_specificity_method": "Concrete tools, domains, team/product words and numeric details raise the score; boilerplate phrases lower it.",
            "company_posting_velocity": velocity,
            "history_days": history_days,
            "verdict": "; ".join(caveats) if caveats else "No obvious staleness signal from available data.",
        }

    return {"history_days": history_days, "job_key_history_days": len(keyed_rows)}

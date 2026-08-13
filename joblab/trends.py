"""The repo's small memory of how the market is changing.

GitHub Pages has no database, and the product should not need one. The trade-off
is that the nightly job commits a compact aggregate into data/history/. Those
JSON files are intentionally boring: small enough to review in git, rich enough
to answer whether a company, city, skill or pay band moved over time.
"""

from __future__ import annotations

import json
import statistics
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .models import Job

ROOT = Path(__file__).resolve().parent.parent
HISTORY_DIR = ROOT / "data" / "history"


def _median_pay(jobs: list[Job]) -> int | None:
    values = []
    for job in jobs:
        band = job.salary_parsed
        if band:
            values.append((band["inr_low"] + band["inr_high"]) // 2)
    return int(statistics.median(values)) if values else None


def snapshot_for(jobs: list[Job], *, today: date | None = None) -> dict:
    """Build the daily aggregate, never storing full job descriptions."""
    today = today or date.today()
    keyword_df: Counter[str] = Counter()
    for job in jobs:
        keyword_df.update(set(job.keywords))

    return {
        "date": today.isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "job_count": len(jobs),
        "eligible_count": sum(1 for job in jobs if job.eligible),
        "per_company": dict(Counter(job.company for job in jobs).most_common()),
        "job_keys": sorted(
            {
                f"{job.company.strip().lower()}|{job.title.strip().lower()}"
                for job in jobs
                if job.company and job.title
            }
        ),
        "per_city": dict(Counter(city for job in jobs for city in job.cities).most_common()),
        "per_seniority": dict(Counter(job.seniority_label for job in jobs).most_common()),
        "median_disclosed_pay_inr": _median_pay(jobs),
        "keyword_doc_frequency": dict(keyword_df.most_common(40)),
    }


def _load_history(history_dir: Path = HISTORY_DIR) -> list[dict]:
    rows: list[dict] = []
    if not history_dir.exists():
        return rows
    for path in sorted(history_dir.glob("*.json")):
        try:
            rows.append(json.loads(path.read_text()))
        except (OSError, json.JSONDecodeError):
            continue
    return rows


def _nearest_on_or_before(rows: list[dict], target: date, *, tolerance_days: int = 7) -> dict | None:
    candidates = []
    for row in rows:
        try:
            day = date.fromisoformat(row["date"])
        except (KeyError, ValueError):
            continue
        if day <= target:
            candidates.append((day, row))
    day, row = max(candidates, default=(None, None), key=lambda pair: pair[0] or date.min)
    if not day or (target - day).days > tolerance_days:
        return None
    return row


def _diff_counts(now: dict[str, int], then: dict[str, int]) -> dict:
    opened = sorted(
        ({"name": key, "now": value, "then": then.get(key, 0), "change": value - then.get(key, 0)} for key, value in now.items() if value > then.get(key, 0)),
        key=lambda r: (-r["change"], r["name"]),
    )[:15]
    froze = sorted(
        ({"name": key, "then": value, "now": now.get(key, 0), "change": now.get(key, 0) - value} for key, value in then.items() if now.get(key, 0) < value),
        key=lambda r: (r["change"], r["name"]),
    )[:15]
    return {"opened": opened, "froze": froze}


def _keyword_moves(latest: dict, previous: dict) -> dict:
    now_total = max(1, int(latest.get("job_count") or 0))
    then_total = max(1, int(previous.get("job_count") or 0))
    now = latest.get("keyword_doc_frequency") or {}
    then = previous.get("keyword_doc_frequency") or {}
    rows = []
    for term in sorted(set(now) | set(then)):
        now_share = (now.get(term, 0) / now_total) if now_total else 0
        then_share = (then.get(term, 0) / then_total) if then_total else 0
        rows.append(
            {
                "term": term,
                "now_jobs": now.get(term, 0),
                "then_jobs": then.get(term, 0),
                "share_change": round(now_share - then_share, 4),
            }
        )
    rising = [r for r in sorted(rows, key=lambda r: (-r["share_change"], r["term"])) if r["share_change"] > 0][:12]
    falling = [r for r in sorted(rows, key=lambda r: (r["share_change"], r["term"])) if r["share_change"] < 0][:12]
    return {"rising": rising, "falling": falling}


def _comparison(latest: dict, previous: dict | None, days: int) -> dict:
    if not previous or previous.get("date") == latest.get("date"):
        return {"status": "not_enough_history", "days": days, "message": f"Need a snapshot from about {days} days ago."}

    try:
        actual_days = (date.fromisoformat(latest["date"]) - date.fromisoformat(previous["date"])).days
    except (KeyError, ValueError):
        actual_days = None

    pay_now = latest.get("median_disclosed_pay_inr")
    pay_then = previous.get("median_disclosed_pay_inr")
    pay = {
        "now": pay_now,
        "then": pay_then,
        "change": (pay_now - pay_then) if isinstance(pay_now, int) and isinstance(pay_then, int) else None,
    }
    return {
        "status": "ok",
        "days": days,
        "actual_days": actual_days,
        "from_date": previous.get("date"),
        "to_date": latest.get("date"),
        "job_count_change": int(latest.get("job_count") or 0) - int(previous.get("job_count") or 0),
        "eligible_count_change": int(latest.get("eligible_count") or 0) - int(previous.get("eligible_count") or 0),
        "companies": _diff_counts(latest.get("per_company") or {}, previous.get("per_company") or {}),
        "skills": _keyword_moves(latest, previous),
        "pay": pay,
    }


def build_trends(jobs: list[Job], *, write: bool = True, history_dir: Path = HISTORY_DIR, today: date | None = None) -> dict:
    """Append today's snapshot and compare it with the committed past."""
    today = today or date.today()
    latest = snapshot_for(jobs, today=today)
    if write:
        history_dir.mkdir(parents=True, exist_ok=True)
        (history_dir / f"{today.isoformat()}.json").write_text(json.dumps(latest, indent=2, sort_keys=True))

    rows = _load_history(history_dir)
    if not any(row.get("date") == latest["date"] for row in rows):
        rows.append(latest)
    rows = sorted(rows, key=lambda r: r.get("date", ""))

    comparisons = {}
    for days in (7, 30, 90):
        previous = _nearest_on_or_before(rows, today - timedelta(days=days))
        comparisons[f"{days}d"] = _comparison(latest, previous, days)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "latest": latest,
        "history_days": len(rows),
        "comparisons": comparisons,
    }

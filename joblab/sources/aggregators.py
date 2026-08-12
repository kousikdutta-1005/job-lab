"""Aggregators that already know about companies the registry has never heard of.

The registry covers companies worth watching. These four cover the long tail —
remote-first startups posting a single design role — and they need no seed list
at all. Between them they are the reason the board is not just a list of the
hundred companies I happened to think of.
"""

from __future__ import annotations

import ast
import html as html_mod
import re
from datetime import datetime, timezone

from ..models import Job, html_to_text, job_id
from ..net import fetch_json, fetch_text


def _iso(value) -> str | None:
    if not value:
        return None
    text = str(value).strip()
    # Several of these feeds send epoch seconds as a string.
    if re.fullmatch(r"\d{9,13}", text):
        seconds = int(text)
        if seconds > 10_000_000_000:
            seconds //= 1000
        try:
            return datetime.fromtimestamp(seconds, tz=timezone.utc).date().isoformat()
        except (OSError, OverflowError, ValueError):
            return None
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(float(value), tz=timezone.utc).date().isoformat()
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date().isoformat()
    except (ValueError, OSError, OverflowError):
        m = re.search(r"\d{4}-\d{2}-\d{2}", text)
        if m:
            return m.group(0)
        try:
            return (
                datetime.strptime(text[:25].strip(), "%a, %d %b %Y %H:%M:%S")
                .date()
                .isoformat()
            )
        except ValueError:
            return None


def _maybe_list(value) -> list[str]:
    """Himalayas serialises lists as their Python repr, e.g. "['United States']".

    Joining that string directly produced one character per separator, which is
    how a job restricted to the United States ended up displayed as gibberish.
    """
    if isinstance(value, (list, tuple)):
        return [str(v).strip() for v in value if str(v).strip()]
    text = str(value or "").strip()
    if not text or text in ("[]", "None"):
        return []
    if text.startswith("[") and text.endswith("]"):
        try:
            parsed = ast.literal_eval(text)
        except (ValueError, SyntaxError):
            return [t.strip(" '\"") for t in text.strip("[]").split(",") if t.strip(" '\"")]
        if isinstance(parsed, (list, tuple)):
            return [str(v).strip() for v in parsed if str(v).strip()]
        return [str(parsed)]
    return [text]


def fetch_remotive() -> tuple[list[Job], str | None]:
    """Remotive publishes a free JSON feed of remote jobs by category."""
    payload, error = fetch_json(
        "https://remotive.com/api/remote-jobs?category=design&limit=200", cache_hours=6
    )
    if error:
        return [], error

    jobs: list[Job] = []
    for item in (payload or {}).get("jobs", []) or []:
        title = item.get("title") or ""
        company = item.get("company_name") or ""
        url = item.get("url") or ""
        location = item.get("candidate_required_location") or "Remote"
        jobs.append(
            Job(
                id=job_id(company, title, url),
                title=title,
                company=company,
                company_slug=re.sub(r"[^a-z0-9]+", "", company.lower()),
                source="remotive",
                url=url,
                location_raw=f"Remote — {location}",
                description_text=html_to_text(item.get("description") or ""),
                department=item.get("category"),
                posted_at=_iso(item.get("publication_date")),
                salary=item.get("salary") or None,
            )
        )
    return jobs, None


def fetch_arbeitnow() -> tuple[list[Job], str | None]:
    """Arbeitnow's board API is open and paginated; design roles are filtered later."""
    jobs: list[Job] = []
    last_error: str | None = None
    for page in range(1, 6):
        payload, error = fetch_json(
            f"https://www.arbeitnow.com/api/job-board-api?page={page}", cache_hours=6
        )
        if error:
            last_error = error
            break
        rows = (payload or {}).get("data", []) or []
        if not rows:
            break
        for item in rows:
            title = item.get("title") or ""
            company = item.get("company_name") or ""
            url = item.get("url") or ""
            location = item.get("location") or ""
            if item.get("remote"):
                location = f"{location} (Remote)".strip()
            jobs.append(
                Job(
                    id=job_id(company, title, url),
                    title=title,
                    company=company,
                    company_slug=re.sub(r"[^a-z0-9]+", "", company.lower()),
                    source="arbeitnow",
                    url=url,
                    location_raw=location,
                    description_text=html_to_text(item.get("description") or ""),
                    posted_at=_iso(item.get("created_at")),
                )
            )
    return jobs, last_error


def fetch_himalayas(max_pages: int = 60) -> tuple[list[Job], str | None]:
    """Himalayas indexes remote-first companies and states region eligibility well.

    Its API ignores the category parameter and reports six figures of open jobs,
    so paging the whole index is not an option. The feed is sorted newest-first,
    which makes a bounded window of recent postings the useful slice: design
    roles are a thin layer of it, but they are the fresh ones.
    """
    jobs: list[Job] = []
    last_error: str | None = None
    page_size = 20

    for page in range(max_pages):
        payload, error = fetch_json(
            f"https://himalayas.app/jobs/api?limit={page_size}&offset={page * page_size}",
            cache_hours=6,
        )
        if error:
            last_error = error
            break
        rows = (payload or {}).get("jobs", []) or []
        if not rows:
            break
        for item in rows:
            title = item.get("title") or ""
            company = _himalayas_company(item)
            url = item.get("applicationLink") or item.get("guid") or ""
            regions = _maybe_list(item.get("locationRestrictions"))
            location = "Remote — " + (", ".join(regions) if regions else "Worldwide")
            jobs.append(
                Job(
                    id=job_id(company, title, url),
                    title=title,
                    company=company,
                    company_slug=item.get("companySlug")
                    or re.sub(r"[^a-z0-9]+", "", company.lower()),
                    source="himalayas",
                    url=url,
                    location_raw=location,
                    description_text=html_to_text(item.get("description") or ""),
                    posted_at=_iso(item.get("pubDate")),
                    salary=_himalayas_salary(item),
                )
            )
    return jobs, last_error


# Himalayas leaks its own template placeholders into the feed, so a large share
# of rows claim the company is literally called "name".
_HIMALAYAS_PLACEHOLDERS = {"name", "company", "companyname", "thumbnail_url", "null", "none"}


def _himalayas_company(item: dict) -> str:
    raw = (item.get("companyName") or "").strip()
    if raw and raw.lower() not in _HIMALAYAS_PLACEHOLDERS:
        return raw
    slug = (item.get("companySlug") or "").strip()
    if slug:
        return slug.replace("-", " ").replace("_", " ").title()
    return "Unknown"


def _himalayas_salary(item: dict) -> str | None:
    lo, hi = item.get("minSalary"), item.get("maxSalary")
    cur = item.get("currency") or item.get("salaryCurrency") or "USD"
    period = (item.get("salaryPeriod") or "").lower()
    suffix = {"hourly": "/hr", "monthly": "/mo", "weekly": "/wk", "daily": "/day"}.get(period, "")
    try:
        lo_n, hi_n = int(float(lo)), int(float(hi))
    except (TypeError, ValueError):
        return None
    if lo_n <= 0 or hi_n <= 0:
        return None
    return f"{cur} {lo_n:,} – {hi_n:,}{suffix}"


_ITEM_RE = re.compile(r"<item>(.*?)</item>", re.S | re.I)


def _rss_field(block: str, tag: str) -> str:
    m = re.search(rf"<{tag}[^>]*>(.*?)</{tag}>", block, re.S | re.I)
    if not m:
        return ""
    value = m.group(1).strip()
    value = re.sub(r"^<!\[CDATA\[(.*?)\]\]>$", r"\1", value, flags=re.S)
    return html_mod.unescape(value).strip()


def fetch_weworkremotely() -> tuple[list[Job], str | None]:
    """We Work Remotely has no JSON API but publishes a per-category RSS feed."""
    body, error = fetch_text(
        "https://weworkremotely.com/categories/remote-design-jobs.rss", cache_hours=6
    )
    if error or not body:
        return [], error or "empty feed"

    jobs: list[Job] = []
    for block in _ITEM_RE.findall(body):
        raw_title = _rss_field(block, "title")
        url = _rss_field(block, "link")
        # WWR writes "Company: Job Title" in a single title field.
        if ":" in raw_title:
            company, title = raw_title.split(":", 1)
        else:
            company, title = "", raw_title
        company, title = company.strip(), title.strip()
        if not title:
            continue
        region = _rss_field(block, "region") or "Anywhere"
        jobs.append(
            Job(
                id=job_id(company, title, url),
                title=title,
                company=company or "Unknown",
                company_slug=re.sub(r"[^a-z0-9]+", "", company.lower()),
                source="weworkremotely",
                url=url,
                location_raw=f"Remote — {region}",
                description_text=html_to_text(_rss_field(block, "description")),
                posted_at=_iso(_rss_field(block, "pubDate")),
            )
        )
    return jobs, None


AGGREGATORS = {
    "remotive": fetch_remotive,
    "arbeitnow": fetch_arbeitnow,
    "himalayas": fetch_himalayas,
    "weworkremotely": fetch_weworkremotely,
}

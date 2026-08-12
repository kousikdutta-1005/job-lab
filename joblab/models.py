"""The one shape every source is flattened into."""

from __future__ import annotations

import hashlib
import html
import re
from dataclasses import asdict, dataclass, field

_TAG_RE = re.compile(r"<[^>]+>")
_SCRIPT_RE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.I | re.S)
_BLOCK_RE = re.compile(r"</(p|div|li|ul|ol|h[1-6]|br|tr|table|section)>", re.I)
_BR_RE = re.compile(r"<br\s*/?>", re.I)


def html_to_text(raw: str) -> str:
    """Flatten description HTML into readable plain text.

    Keeps paragraph and list breaks, because the resume matcher reads bullets
    and a wall of text loses the requirement structure entirely.
    """
    if not raw:
        return ""
    text = raw
    for _ in range(2):
        unescaped = html.unescape(text)
        if unescaped == text:
            break
        text = unescaped
    text = _SCRIPT_RE.sub(" ", text)
    text = _BR_RE.sub("\n", text)
    text = _BLOCK_RE.sub("\n", text)
    text = re.sub(r"<li[^>]*>", "\n• ", text, flags=re.I)
    text = _TAG_RE.sub(" ", text)
    text = html.unescape(text)
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    return text.strip()


def job_id(company: str, title: str, url: str) -> str:
    """Stable identifier used to dedupe the same job across sources.

    Built from company plus title plus the URL path rather than the full URL,
    because tracking parameters change between crawls and would otherwise make
    every job look new every night.
    """
    path = re.sub(r"[?#].*$", "", url or "")
    seed = f"{(company or '').strip().lower()}|{(title or '').strip().lower()}|{path}"
    return hashlib.sha256(seed.encode()).hexdigest()[:16]


def dedupe_key(company: str, title: str, location: str) -> str:
    """Looser key: the same role posted to two boards should collapse into one."""
    def squash(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", (value or "").lower())

    # Only the first location token, so "Bengaluru, India" and "Bengaluru,
    # Karnataka, India" do not look like two different jobs.
    first_loc = (location or "").split(",")[0]
    return f"{squash(company)}|{squash(title)}|{squash(first_loc)}"


@dataclass
class Job:
    id: str
    title: str
    company: str
    company_slug: str
    source: str
    url: str
    location_raw: str

    description_text: str = ""
    department: str | None = None
    posted_at: str | None = None
    salary: str | None = None
    salary_parsed: dict | None = None

    # Filled in by the classify stage.
    workplace: str = "unknown"
    cities: list[str] = field(default_factory=list)
    points: list[dict] = field(default_factory=list)
    india: bool = False
    region_lock: str | None = None
    eligible: bool = True
    eligibility_reason: str = ""
    seniority: str = "mid"
    seniority_label: str = "Mid-level"
    years_min: int | None = None
    years_max: int | None = None
    keywords: list[str] = field(default_factory=list)
    keyword_groups: dict[str, list[str]] = field(default_factory=dict)

    # Filled in by the contacts stage.
    company_domain: str | None = None
    email_pattern: str | None = None
    email_pattern_confidence: str = "unknown"
    linkedin: dict[str, str] = field(default_factory=dict)

    # Filled in by the scoring stage.
    match_score: int = 0
    match_reasons: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

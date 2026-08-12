"""Ranking a job against a person, and saying why.

The score is deliberately explainable. Every point added or removed carries a
sentence, and the board shows those sentences, because a ranked list you cannot
interrogate is just a list in a confident order.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

import yaml

from .config import SENIORITY_META, SENIORITY_ORDER, normalise_title
from .models import Job

PROFILE_PATH = Path(__file__).resolve().parent.parent / "data" / "profile.yaml"


@dataclass
class Profile:
    name: str = ""
    title: str = ""
    years_experience: int = 0
    portfolio: str = ""
    location: str = "India"
    open_to: tuple[str, ...] = ("India", "Remote")
    target_titles: tuple[str, ...] = ()
    strengths: tuple[str, ...] = ()
    prefer_tags: tuple[str, ...] = ()

    @property
    def seniority(self) -> str:
        """Where this many years of experience sits on the ladder."""
        years = self.years_experience
        for key in SENIORITY_ORDER:
            label, lo, hi = SENIORITY_META[key]
            if key in ("executive", "director", "head", "manager"):
                continue
            if lo <= years <= hi:
                return key
        return "senior" if years >= 4 else "mid"

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "title": self.title,
            "years_experience": self.years_experience,
            "portfolio": self.portfolio,
            "location": self.location,
            "open_to": list(self.open_to),
            "target_titles": list(self.target_titles),
            "strengths": list(self.strengths),
            "prefer_tags": list(self.prefer_tags),
        }


def load_profile(path: Path = PROFILE_PATH) -> Profile:
    raw = yaml.safe_load(path.read_text()) or {}
    return Profile(
        name=raw.get("name", ""),
        title=raw.get("title", ""),
        years_experience=int(raw.get("years_experience") or 0),
        portfolio=raw.get("portfolio", ""),
        location=raw.get("location", "India"),
        open_to=tuple(raw.get("open_to") or ()),
        target_titles=tuple(raw.get("target_titles") or ()),
        strengths=tuple(s.lower() for s in (raw.get("strengths") or ())),
        prefer_tags=tuple(raw.get("prefer_tags") or ()),
    )


# Distance between rungs, so "one level up" costs less than "three levels up".
_LADDER = ("junior", "mid", "senior", "lead", "staff", "principal", "manager", "head", "director", "executive")
_LADDER_INDEX = {key: i for i, key in enumerate(_LADDER)}


def _seniority_gap(job_seniority: str, my_seniority: str) -> int:
    a = _LADDER_INDEX.get(job_seniority)
    b = _LADDER_INDEX.get(my_seniority)
    if a is None or b is None:
        return 0
    return a - b


def _days_old(posted_at: str | None, today: date) -> int | None:
    if not posted_at:
        return None
    try:
        return (today - datetime.fromisoformat(posted_at).date()).days
    except ValueError:
        return None


@dataclass
class Verdict:
    score: int
    reasons: list[str] = field(default_factory=list)


def score_job(job: Job, profile: Profile, today: date | None = None) -> Verdict:
    """Score out of 100, with a sentence for every component."""
    today = today or date.today()
    score = 0
    reasons: list[str] = []

    # --- Seniority, 35 points. The biggest single reason a good job is a bad fit.
    gap = _seniority_gap(job.seniority, profile.seniority)
    if gap == 0:
        score += 35
        reasons.append(f"{job.seniority_label} matches your level")
    elif gap == 1:
        score += 28
        reasons.append(f"{job.seniority_label} is one level up — a stretch worth taking")
    elif gap == -1:
        score += 18
        reasons.append(f"{job.seniority_label} is one level below you")
    elif gap >= 2:
        score += 6
        reasons.append(f"{job.seniority_label} is {gap} levels above you")
    else:
        score += 2
        reasons.append(f"{job.seniority_label} is {abs(gap)} levels below you")

    # Stated years, which override the title when the posting bothers to say.
    if job.years_min is not None:
        mine = profile.years_experience
        if mine >= job.years_min:
            score += 8
            reasons.append(f"Asks for {job.years_min}+ years and you have {mine}")
        elif mine >= job.years_min - 1:
            score += 5
            reasons.append(f"Asks for {job.years_min}+ years — you are within a year")
        else:
            score -= 6
            reasons.append(f"Asks for {job.years_min}+ years, {job.years_min - mine} more than you have")

    # --- Where it is, 20 points.
    if not job.eligible:
        reasons.append(job.eligibility_reason)
    elif job.india and job.workplace == "remote":
        score += 20
        reasons.append("Remote, and the company hires in India")
    elif job.india:
        score += 18
        reasons.append(f"In India{' — ' + ', '.join(job.cities) if job.cities else ''}")
    elif job.workplace == "remote":
        score += 15
        reasons.append(job.eligibility_reason)
    else:
        score += 4

    # --- Title fit, 20 points.
    title = normalise_title(job.title)
    targets = [normalise_title(t) for t in profile.target_titles]
    if any(title == t for t in targets):
        score += 20
        reasons.append("Exactly one of your target titles")
    elif any(t in title or title in t for t in targets):
        score += 15
        reasons.append("Close to your target titles")
    elif "product design" in title or "ux" in title:
        score += 11
    else:
        score += 5

    # --- What the job is about, 15 points.
    if profile.strengths and job.keywords:
        overlap = set(job.keywords) & set(profile.strengths)
        share = len(overlap) / max(6, len(set(job.keywords)))
        earned = min(15, round(share * 30))
        score += earned
        if overlap:
            top = sorted(overlap)[:4]
            reasons.append(f"Overlaps your strengths: {', '.join(top)}")

    # --- Freshness, 10 points. A month-old design role is usually already shortlisted.
    age = _days_old(job.posted_at, today)
    if age is None:
        score += 4
    elif age <= 3:
        score += 10
        reasons.append("Posted in the last three days")
    elif age <= 10:
        score += 8
        reasons.append(f"Posted {age} days ago")
    elif age <= 30:
        score += 5
    elif age <= 60:
        score += 2
    else:
        score -= 4
        reasons.append(f"Posted {age} days ago — likely cold")

    return Verdict(score=max(0, min(100, score)), reasons=reasons)

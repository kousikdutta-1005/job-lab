"""Published salary benchmarks, kept separate from crawled postings.

Crawled salary bands are best because they come from live roles, but many design
postings do not publish pay and Indian postings almost never do. This module is
the second tier: a committed, cited table that can be reviewed in git and shown
with source/confidence labels instead of pretending sparse crawled data is a
market benchmark.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from .salary import FX_TO_INR

ROOT = Path(__file__).resolve().parent.parent
BENCHMARK_PATH = ROOT / "data" / "benchmarks.yaml"

SENIORITY_FALLBACKS: dict[str, tuple[str, ...]] = {
    "executive": ("manager", "lead", "senior"),
    "director": ("manager", "lead", "senior"),
    "head": ("manager", "lead", "senior"),
    "manager": ("manager", "lead", "senior"),
    "principal": ("lead", "senior"),
    "staff": ("lead", "senior"),
    "lead": ("lead", "senior"),
    "senior": ("senior", "mid"),
    "mid": ("mid", "senior"),
    "junior": ("junior", "mid"),
}


@dataclass(frozen=True)
class BenchmarkBand:
    role: str
    city: str
    region: str
    country: str
    seniority: str
    years_experience: str
    currency: str
    low: int
    median: int
    high: int
    source_name: str
    source_url: str
    retrieved_at: str
    confidence: str
    notes: str = ""

    @property
    def low_inr(self) -> int:
        return round(self.low * FX_TO_INR.get(self.currency, 1.0))

    @property
    def median_inr(self) -> int:
        return round(self.median * FX_TO_INR.get(self.currency, 1.0))

    @property
    def high_inr(self) -> int:
        return round(self.high * FX_TO_INR.get(self.currency, 1.0))

    def to_dict(self) -> dict:
        return {
            "role": self.role,
            "city": self.city,
            "region": self.region,
            "country": self.country,
            "seniority": self.seniority,
            "years_experience": self.years_experience,
            "currency": self.currency,
            "low": self.low,
            "median": self.median,
            "high": self.high,
            "low_inr": self.low_inr,
            "median_inr": self.median_inr,
            "high_inr": self.high_inr,
            "source_name": self.source_name,
            "source_url": self.source_url,
            "retrieved_at": self.retrieved_at,
            "confidence": self.confidence,
            "notes": self.notes,
        }


def load_benchmarks(path: Path = BENCHMARK_PATH) -> dict:
    raw = yaml.safe_load(path.read_text()) or {}
    bands = []
    for row in raw.get("bands") or []:
        bands.append(
            BenchmarkBand(
                role=str(row.get("role", "")),
                city=str(row.get("city", "")),
                region=str(row.get("region", "")),
                country=str(row.get("country", "")),
                seniority=str(row.get("seniority", "")),
                years_experience=str(row.get("years_experience", "")),
                currency=str(row.get("currency", "INR")),
                low=int(row.get("low") or 0),
                median=int(row.get("median") or 0),
                high=int(row.get("high") or 0),
                source_name=str(row.get("source_name", "")),
                source_url=str(row.get("source_url", "")),
                retrieved_at=str(row.get("retrieved_at") or raw.get("retrieved_at", "")),
                confidence=str(row.get("confidence", "reported")),
                notes=str(row.get("notes", "")),
            )
        )
    return {"retrieved_at": raw.get("retrieved_at"), "note": raw.get("note", ""), "bands": bands}


def export_benchmarks(path: Path = BENCHMARK_PATH) -> dict:
    loaded = load_benchmarks(path)
    return {
        "retrieved_at": loaded["retrieved_at"],
        "note": loaded["note"],
        "bands": [band.to_dict() for band in loaded["bands"]],
    }


def benchmark_for(city: str, country: str, seniority: str, *, path: Path = BENCHMARK_PATH) -> BenchmarkBand | None:
    """Best matching published benchmark for a city/country/seniority.

    Exact city wins, then country-level region rows if they are ever added. The
    seniority fallback is explicit so a Staff/Principal posting can use a Lead
    benchmark rather than silently falling all the way to a mid-level number.
    """
    loaded = load_benchmarks(path)
    wanted = SENIORITY_FALLBACKS.get(seniority, (seniority,))
    city_norm = (city or "").lower()
    country_norm = (country or "").lower()

    for level in wanted:
        exact = [
            band for band in loaded["bands"]
            if band.seniority == level and band.city.lower() == city_norm and band.country.lower() == country_norm
        ]
        if exact:
            return exact[0]
        regional = [
            band for band in loaded["bands"]
            if band.seniority == level and band.city.lower() in {country_norm, band.region.lower()} and band.country.lower() == country_norm
        ]
        if regional:
            return regional[0]
    return None


def benchmark_basis(band: BenchmarkBand) -> dict[str, Any]:
    return {"tier": 2, "kind": "published_benchmark", "band": band.to_dict()}

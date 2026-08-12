"""Job sources: registry-driven ATS boards, plus open aggregators."""

from .aggregators import AGGREGATORS
from .ats import ATS_PLATFORMS, fetch_ats, probe, slug_candidates

__all__ = ["AGGREGATORS", "ATS_PLATFORMS", "fetch_ats", "probe", "slug_candidates"]

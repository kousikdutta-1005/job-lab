"""One HTTP session for the whole crawl: polite, cached, and never fatal.

Every source here is a free public endpoint run by someone else. The crawl is
built to degrade rather than fail — a source that is down produces zero jobs and
a recorded error, not a broken build.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any

import requests

CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "cache"
USER_AGENT = (
    "job-lab/0.1 (+https://github.com/kousikdutta-1005/job-lab) "
    "personal job search crawler; contact via GitHub issues"
)

DEFAULT_TIMEOUT = 20
MAX_RETRIES = 3
BACKOFF_SECONDS = 1.5

_session: requests.Session | None = None


def session() -> requests.Session:
    global _session
    if _session is None:
        s = requests.Session()
        s.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json, text/*"})
        _session = s
    return _session


def _cache_path(url: str) -> Path:
    digest = hashlib.sha256(url.encode()).hexdigest()[:20]
    return CACHE_DIR / f"{digest}.json"


def fetch_json(
    url: str,
    *,
    cache_hours: float = 6.0,
    timeout: int = DEFAULT_TIMEOUT,
    headers: dict[str, str] | None = None,
) -> tuple[Any | None, str | None]:
    """GET a URL and parse JSON.

    Returns (payload, error). Exactly one is None. Responses are cached on disk
    so a re-run during development does not hammer a stranger's job board.
    """
    path = _cache_path(url)
    if cache_hours > 0 and path.exists():
        age_hours = (time.time() - path.stat().st_mtime) / 3600
        if age_hours < cache_hours:
            try:
                return json.loads(path.read_text()), None
            except (json.JSONDecodeError, OSError):
                pass

    last_error: str | None = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = session().get(url, timeout=timeout, headers=headers)
        except requests.RequestException as exc:
            last_error = f"{type(exc).__name__}: {exc}"
            time.sleep(BACKOFF_SECONDS * (attempt + 1))
            continue

        if resp.status_code == 404:
            # Not an error worth retrying: the board simply does not exist.
            return None, "404"
        if resp.status_code == 429:
            time.sleep(BACKOFF_SECONDS * (attempt + 2) * 2)
            last_error = "429 rate limited"
            continue
        if resp.status_code >= 400:
            last_error = f"HTTP {resp.status_code}"
            time.sleep(BACKOFF_SECONDS * (attempt + 1))
            continue

        try:
            payload = resp.json()
        except ValueError:
            return None, "response was not JSON"

        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        try:
            path.write_text(json.dumps(payload))
        except OSError:
            pass
        return payload, None

    return None, last_error or "unknown error"


def fetch_text(
    url: str,
    *,
    cache_hours: float = 6.0,
    timeout: int = DEFAULT_TIMEOUT,
    retries: int = MAX_RETRIES,
) -> tuple[str | None, str | None]:
    """GET a URL and return its body as text, for the RSS and HTML sources.

    `retries` is tunable because best-effort probes (does this careers page
    exist at all?) should fail in a second rather than spend a minute proving
    that a hostname does not resolve.
    """
    path = _cache_path(url).with_suffix(".txt")
    if cache_hours > 0 and path.exists():
        age_hours = (time.time() - path.stat().st_mtime) / 3600
        if age_hours < cache_hours:
            try:
                return path.read_text(), None
            except OSError:
                pass

    last_error: str | None = None
    for attempt in range(max(1, retries)):
        try:
            resp = session().get(url, timeout=timeout)
        except requests.RequestException as exc:
            last_error = f"{type(exc).__name__}: {exc}"
            # A hostname that does not resolve will not resolve on retry either.
            if isinstance(exc, requests.exceptions.ConnectionError):
                break
            time.sleep(BACKOFF_SECONDS * (attempt + 1))
            continue
        if resp.status_code == 404:
            return None, "404"
        if resp.status_code >= 400:
            last_error = f"HTTP {resp.status_code}"
            if resp.status_code < 500:
                break
            time.sleep(BACKOFF_SECONDS * (attempt + 1))
            continue

        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        try:
            path.write_text(resp.text)
        except OSError:
            pass
        return resp.text, None

    return None, last_error or "unknown error"

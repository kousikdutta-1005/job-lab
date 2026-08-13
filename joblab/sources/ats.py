"""Read job boards that companies publish deliberately and machine-readably.

Every endpoint here is the documented public JSON feed that powers a company's
own careers page. Nothing is authenticated, nothing is behind a login, and
nothing is parsed out of rendered HTML meant for humans. That is the whole
reason this crawl keeps working while scrapers rot.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Callable

from ..geo import is_india
from ..models import Job, html_to_text, job_id
from ..net import fetch_json, fetch_text, post_json


def slug_candidates(name: str, domain: str | None = None) -> list[str]:
    """Board tokens worth trying for a company, most likely first."""
    base = (name or "").strip().lower()
    suffix_re = re.compile(
        r"\b(inc|incorporated|technologies|technology|labs|software|systems|solutions|"
        r"private|limited|pvt|ltd|llc|corp|corporation)\b",
        re.I,
    )

    variants = [base, suffix_re.sub(" ", base)]
    if domain:
        variants.append(domain.split(".")[0])

    out: list[str] = []
    for variant in variants:
        variant = (variant or "").strip().lower()
        parts = [p for p in re.split(r"[^a-z0-9]+", variant) if p]
        candidates = [
            "".join(parts),
            "-".join(parts),
            parts[0] if parts else "",
        ]
        for candidate in candidates:
            if candidate and candidate not in out:
                out.append(candidate)

    return out[:8]


def _iso(value) -> str | None:
    """Normalise the four different date shapes these APIs return."""
    if value in (None, "", 0):
        return None
    try:
        if isinstance(value, (int, float)):
            # Lever uses epoch milliseconds.
            seconds = value / 1000 if value > 10_000_000_000 else value
            return datetime.fromtimestamp(seconds, tz=timezone.utc).date().isoformat()
        text = str(value).strip().replace("Z", "+00:00")
        return datetime.fromisoformat(text).date().isoformat()
    except (ValueError, OSError, OverflowError):
        m = re.search(r"\d{4}-\d{2}-\d{2}", str(value))
        return m.group(0) if m else None


# ---------------------------------------------------------------------------
# Greenhouse
# ---------------------------------------------------------------------------

def greenhouse_url(slug: str) -> str:
    return f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"


def parse_greenhouse(payload, company: str, slug: str) -> list[Job]:
    jobs: list[Job] = []
    for item in (payload or {}).get("jobs", []) or []:
        title = item.get("title") or ""
        url = item.get("absolute_url") or ""
        location = (item.get("location") or {}).get("name") or ""
        offices = [o.get("name", "") for o in item.get("offices", []) or []]
        if offices and not location:
            location = ", ".join(x for x in offices if x)
        dept = ", ".join(d.get("name", "") for d in item.get("departments", []) or []) or None
        jobs.append(
            Job(
                id=job_id(company, title, url),
                title=title,
                company=company,
                company_slug=slug,
                source="greenhouse",
                url=url,
                location_raw=location,
                description_text=html_to_text(item.get("content") or ""),
                department=dept,
                posted_at=_iso(item.get("updated_at") or item.get("first_published")),
            )
        )
    return jobs


# ---------------------------------------------------------------------------
# Lever
# ---------------------------------------------------------------------------

def lever_url(slug: str) -> str:
    return f"https://api.lever.co/v0/postings/{slug}?mode=json"


def parse_lever(payload, company: str, slug: str) -> list[Job]:
    jobs: list[Job] = []
    for item in payload or []:
        if not isinstance(item, dict):
            continue
        title = item.get("text") or ""
        url = item.get("hostedUrl") or item.get("applyUrl") or ""
        cat = item.get("categories") or {}
        location = cat.get("location") or ""
        if item.get("workplaceType") and item["workplaceType"] != "unspecified":
            location = f"{location} ({item['workplaceType']})".strip()
        body = " ".join(
            [item.get("descriptionPlain") or item.get("description") or ""]
            + [
                (s.get("text") or "") + " " + (s.get("content") or "")
                for s in item.get("lists", []) or []
            ]
        )
        jobs.append(
            Job(
                id=job_id(company, title, url),
                title=title,
                company=company,
                company_slug=slug,
                source="lever",
                url=url,
                location_raw=location,
                description_text=html_to_text(body),
                department=cat.get("team") or cat.get("department"),
                posted_at=_iso(item.get("createdAt")),
                salary=(item.get("salaryRange") or {}).get("currency") and _lever_salary(item),
            )
        )
    return jobs


def _lever_salary(item: dict) -> str | None:
    sr = item.get("salaryRange") or {}
    lo, hi, cur = sr.get("min"), sr.get("max"), sr.get("currency")
    if lo and hi and cur:
        return f"{cur} {lo:,} – {hi:,}"
    return None


# ---------------------------------------------------------------------------
# Ashby
# ---------------------------------------------------------------------------

def ashby_url(slug: str) -> str:
    return f"https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true"


def parse_ashby(payload, company: str, slug: str) -> list[Job]:
    jobs: list[Job] = []
    for item in (payload or {}).get("jobs", []) or []:
        title = item.get("title") or ""
        url = item.get("jobUrl") or item.get("applyUrl") or ""
        location = item.get("location") or ""
        secondary = [
            loc.get("location", "")
            for loc in item.get("secondaryLocations", []) or []
            if isinstance(loc, dict)
        ]
        if secondary:
            location = ", ".join([location] + [s for s in secondary if s])
        if item.get("isRemote"):
            location = f"{location} (Remote)".strip()
        jobs.append(
            Job(
                id=job_id(company, title, url),
                title=title,
                company=company,
                company_slug=slug,
                source="ashby",
                url=url,
                location_raw=location,
                description_text=html_to_text(
                    item.get("descriptionHtml") or item.get("descriptionPlain") or ""
                ),
                department=item.get("department") or item.get("team"),
                posted_at=_iso(item.get("publishedAt") or item.get("updatedAt")),
                salary=(item.get("compensation") or {}).get("compensationTierSummary"),
            )
        )
    return jobs


# ---------------------------------------------------------------------------
# Workable
# ---------------------------------------------------------------------------

def workable_url(slug: str) -> str:
    return f"https://apply.workable.com/api/v1/widget/accounts/{slug}?details=true"


def parse_workable(payload, company: str, slug: str) -> list[Job]:
    jobs: list[Job] = []
    for item in (payload or {}).get("jobs", []) or []:
        title = item.get("title") or ""
        url = item.get("url") or item.get("application_url") or ""
        location = ", ".join(
            x for x in (item.get("city"), item.get("state"), item.get("country")) if x
        )
        if item.get("telecommuting"):
            location = f"{location} (Remote)".strip()
        jobs.append(
            Job(
                id=job_id(company, title, url),
                title=title,
                company=company,
                company_slug=slug,
                source="workable",
                url=url,
                location_raw=location,
                description_text=html_to_text(
                    (item.get("description") or "") + " " + (item.get("requirements") or "")
                ),
                department=item.get("department"),
                posted_at=_iso(item.get("published_on") or item.get("created_at")),
            )
        )
    return jobs


# ---------------------------------------------------------------------------
# SmartRecruiters
# ---------------------------------------------------------------------------

def smartrecruiters_url(slug: str) -> str:
    return f"https://api.smartrecruiters.com/v1/companies/{slug}/postings?limit=100"


def parse_smartrecruiters(payload, company: str, slug: str) -> list[Job]:
    jobs: list[Job] = []
    for item in (payload or {}).get("content", []) or []:
        title = item.get("name") or ""
        posting_id = item.get("id") or ""
        url = f"https://jobs.smartrecruiters.com/{slug}/{posting_id}"
        loc = item.get("location") or {}
        location = ", ".join(
            x for x in (loc.get("city"), loc.get("region"), loc.get("country")) if x
        )
        if loc.get("remote"):
            location = f"{location} (Remote)".strip()
        jobs.append(
            Job(
                id=job_id(company, title, url),
                title=title,
                company=company,
                company_slug=slug,
                source="smartrecruiters",
                url=url,
                # The list endpoint omits the body; the board falls back to the
                # title and department, and the detail link still works.
                description_text="",
                location_raw=location,
                department=(item.get("department") or {}).get("label"),
                posted_at=_iso(item.get("releasedDate")),
            )
        )
    return jobs


# ---------------------------------------------------------------------------
# Recruitee
# ---------------------------------------------------------------------------

def recruitee_url(slug: str) -> str:
    return f"https://{slug}.recruitee.com/api/offers/"


def parse_recruitee(payload, company: str, slug: str) -> list[Job]:
    jobs: list[Job] = []
    for item in (payload or {}).get("offers", []) or []:
        title = item.get("title") or ""
        url = item.get("careers_url") or item.get("careers_apply_url") or ""
        location = ", ".join(
            x for x in (item.get("city"), item.get("country")) if x
        ) or (item.get("location") or "")
        if (item.get("remote") or "").lower() not in ("", "no"):
            location = f"{location} (Remote)".strip()
        jobs.append(
            Job(
                id=job_id(company, title, url),
                title=title,
                company=company,
                company_slug=slug,
                source="recruitee",
                url=url,
                location_raw=location,
                description_text=html_to_text(
                    (item.get("description") or "") + " " + (item.get("requirements") or "")
                ),
                department=item.get("department"),
                posted_at=_iso(item.get("published_at")),
            )
        )
    return jobs


# ---------------------------------------------------------------------------
# Workday
# ---------------------------------------------------------------------------

def _workday_parts(slug: str) -> tuple[str, str, str]:
    host, site = slug.split("/", 1)
    tenant = host.split(".")[0]
    return host, tenant, site


def workday_url(slug: str) -> str:
    host, tenant, site = _workday_parts(slug)
    return f"https://{host}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs"


def parse_workday(payload, company: str, slug: str) -> list[Job]:
    jobs: list[Job] = []
    host, tenant, site = _workday_parts(slug)
    for item in (payload or {}).get("jobPostings", []) or []:
        title = item.get("title") or ""
        path = item.get("externalPath") or ""
        url = f"https://{host}.myworkdayjobs.com/en-US/{site}{path}" if path else f"https://{host}.myworkdayjobs.com/{site}"
        location = item.get("locationsText") or ", ".join(item.get("locations") or [])
        jobs.append(
            Job(
                id=job_id(company, title, url),
                title=title,
                company=company,
                company_slug=slug,
                source="workday",
                url=url,
                location_raw=location,
                description_text=html_to_text(" ".join(item.get("bulletFields") or [])),
                posted_at=_iso(item.get("startDate") or item.get("postedOn")),
            )
        )
    return jobs


# ---------------------------------------------------------------------------
# Teamtailor
# ---------------------------------------------------------------------------

def teamtailor_url(slug: str) -> str:
    return f"https://{slug}/jobs.json"


def parse_teamtailor(payload, company: str, slug: str) -> list[Job]:
    jobs: list[Job] = []
    for item in (payload or {}).get("items", []) or []:
        if not isinstance(item, dict):
            continue
        schema = item.get("_jobposting") or {}
        title = item.get("title") or schema.get("title") or ""
        url = item.get("url") or ""
        locations = []
        for loc in schema.get("jobLocation") or []:
            address = (loc or {}).get("address") or {}
            locations.append(
                ", ".join(
                    str(x)
                    for x in (
                        address.get("addressLocality"),
                        address.get("addressRegion"),
                        address.get("addressCountry"),
                    )
                    if x
                )
            )
        jobs.append(
            Job(
                id=job_id(company, title, url),
                title=title,
                company=company,
                company_slug=slug,
                source="teamtailor",
                url=url,
                location_raw=", ".join(x for x in locations if x),
                description_text=html_to_text(
                    schema.get("description") or item.get("content_html") or ""
                ),
                department=schema.get("occupationalCategory"),
                posted_at=_iso(item.get("date_published") or schema.get("datePosted")),
            )
        )
    return jobs


# ---------------------------------------------------------------------------
# BambooHR
# ---------------------------------------------------------------------------

def bamboohr_url(slug: str) -> str:
    return f"https://{slug}.bamboohr.com/careers/list"


def parse_bamboohr(payload, company: str, slug: str) -> list[Job]:
    jobs: list[Job] = []
    for item in (payload or {}).get("result", []) or []:
        if not isinstance(item, dict):
            continue
        title = item.get("jobOpeningName") or ""
        job_id_value = item.get("id") or ""
        url = item.get("jobOpeningShareUrl") or (
            f"https://{slug}.bamboohr.com/careers/{job_id_value}" if job_id_value else ""
        )
        loc = item.get("location") or item.get("atsLocation") or {}
        location = ", ".join(
            str(x)
            for x in (
                loc.get("city"),
                loc.get("state") or loc.get("province"),
                loc.get("country"),
            )
            if x
        )
        if item.get("isRemote") or item.get("locationType") == "2":
            location = f"{location} (Remote)".strip()
        jobs.append(
            Job(
                id=job_id(company, title, url),
                title=title,
                company=company,
                company_slug=slug,
                source="bamboohr",
                url=url,
                location_raw=location,
                description_text=html_to_text(
                    item.get("description")
                    or item.get("jobDescription")
                    or item.get("jobOpeningDescription")
                    or ""
                ),
                department=item.get("departmentLabel"),
                posted_at=_iso(item.get("postedDate") or item.get("datePosted")),
            )
        )
    return jobs


# ---------------------------------------------------------------------------
# Registry of supported ATS platforms
# ---------------------------------------------------------------------------

ATSDef = tuple[str, Callable[[str], str], Callable[[object, str, str], list[Job]]]

# Ordered by how common they are among product companies, because detection
# stops at the first board that answers.
ATS_PLATFORMS: tuple[ATSDef, ...] = (
    ("greenhouse", greenhouse_url, parse_greenhouse),
    ("lever", lever_url, parse_lever),
    ("ashby", ashby_url, parse_ashby),
    ("workday", workday_url, parse_workday),
    ("smartrecruiters", smartrecruiters_url, parse_smartrecruiters),
    ("workable", workable_url, parse_workable),
    ("recruitee", recruitee_url, parse_recruitee),
    ("teamtailor", teamtailor_url, parse_teamtailor),
    ("bamboohr", bamboohr_url, parse_bamboohr),
)

ATS_BY_NAME = {name: (url_fn, parse_fn) for name, url_fn, parse_fn in ATS_PLATFORMS}


def fetch_ats(
    ats: str, slug: str, company: str, *, cache_hours: float = 6.0
) -> tuple[list[Job], str | None]:
    """Pull every posting from one company's board on one ATS."""
    entry = ATS_BY_NAME.get(ats)
    if not entry:
        return [], f"unknown ats '{ats}'"
    url_fn, parse_fn = entry
    if ats == "workday":
        try:
            _workday_parts(slug)
        except ValueError:
            return [], "invalid workday slug"
        postings: dict[str, dict] = {}
        payload, error = None, None
        for term in ("design", "ux", "product designer", ""):
            page, page_error = post_json(
                url_fn(slug),
                json_body={"appliedFacets": {}, "limit": 20, "offset": 0, "searchText": term},
                cache_hours=cache_hours,
            )
            if page_error and payload is None:
                error = page_error
                continue
            if isinstance(page, dict):
                payload = page
                for item in page.get("jobPostings", []) or []:
                    postings[item.get("externalPath") or item.get("title") or str(len(postings))] = item
        if payload is not None:
            payload = {**payload, "jobPostings": list(postings.values())}
    elif ats == "bamboohr":
        payload, error = fetch_json(url_fn(slug), cache_hours=cache_hours)
        if isinstance(payload, dict):
            enriched = []
            for item in payload.get("result", []) or []:
                detail_url = item.get("id") and f"https://{slug}.bamboohr.com/careers/{item['id']}/detail"
                if detail_url:
                    detail, detail_error = fetch_json(detail_url, cache_hours=cache_hours)
                    opening = ((detail or {}).get("result") or {}).get("jobOpening") or {}
                    if not detail_error and opening:
                        item = {**item, **opening}
                enriched.append(item)
            payload = {**payload, "result": enriched}
    else:
        payload, error = fetch_json(url_fn(slug), cache_hours=cache_hours)
    if error:
        return [], error
    try:
        return parse_fn(payload, company, slug), None
    except (AttributeError, TypeError, KeyError) as exc:
        return [], f"parse failed: {type(exc).__name__}: {exc}"


def probe(ats: str, slug: str) -> bool:
    """Does this company have a live board on this ATS?

    Deliberately strict. An earlier version accepted any HTTP 200, which was
    wrong in two ways that both produced confident nonsense: SmartRecruiters
    answers 200 with an empty list for *every* company id that has ever
    existed, and short slugs collide across companies — `lever/fi` is not Fi
    Money and `ashby/navi` is not Navi. Requiring at least one real posting
    plus an identity check means a miss is a miss rather than another
    company's jobs filed under the wrong name.
    """
    entry = ATS_BY_NAME.get(ats)
    if not entry:
        return False
    url_fn, parse_fn = entry
    if ats == "workday":
        try:
            _workday_parts(slug)
        except ValueError:
            return False
        payload, error = post_json(
            url_fn(slug),
            json_body={"appliedFacets": {}, "limit": 20, "offset": 0, "searchText": ""},
            cache_hours=24 * 7,
        )
    else:
        payload, error = fetch_json(url_fn(slug), cache_hours=24 * 7)
    if error or payload is None:
        return False
    try:
        jobs = parse_fn(payload, "", slug)
    except (AttributeError, TypeError, KeyError):
        return False
    return len(jobs) > 0


# ---------------------------------------------------------------------------
# Finding the real board token from the company's own careers page
# ---------------------------------------------------------------------------

# Guessing a slug from a company name only works when the two happen to match.
# Razorpay's Greenhouse token is "razorpaysoftwareprivatelimited", which no
# amount of guessing will produce — but their careers page links straight to it.
# Reading that link is the difference between covering a company and not.
_BOARD_LINK_PATTERNS: tuple[tuple[str, str], ...] = (
    ("greenhouse", r"(?:boards|job-boards)\.greenhouse\.io/(?:embed/job_board\?for=)?([a-z0-9_-]{2,60})"),
    ("greenhouse", r"boards-api\.greenhouse\.io/v1/boards/([a-z0-9_-]{2,60})"),
    ("greenhouse", r"greenhouse\.io/embed/job_board\?for=([a-z0-9_-]{2,60})"),
    ("lever", r"jobs\.(?:eu\.)?lever\.co/([a-z0-9_-]{2,60})"),
    ("lever", r"api\.lever\.co/v0/postings/([a-z0-9_-]{2,60})"),
    ("ashby", r"jobs\.ashbyhq\.com/([a-z0-9_.-]{2,60})"),
    ("ashby", r"api\.ashbyhq\.com/posting-api/job-board/([a-z0-9_.-]{2,60})"),
    ("workable", r"apply\.workable\.com/(?:api/v1/widget/accounts/)?([a-z0-9_-]{2,60})"),
    ("smartrecruiters", r"jobs\.smartrecruiters\.com/([A-Za-z0-9_-]{2,60})"),
    ("smartrecruiters", r"careers\.smartrecruiters\.com/([A-Za-z0-9_-]{2,60})"),
    ("recruitee", r"([a-z0-9_-]{2,60})\.recruitee\.com"),
    ("workday", r"https?://([a-z0-9-]+\.wd\d+)\.myworkdayjobs\.com/(?:[a-z]{2}-[A-Z]{2}/)?([A-Za-z0-9_-]{2,80})"),
    ("workday", r"([a-z0-9-]+\.wd\d+)\.myworkdayjobs\.com/wday/cxs/[a-z0-9-]+/([A-Za-z0-9_-]{2,80})/jobs"),
    ("teamtailor", r"https?://((?:[a-z0-9-]+\.)+[a-z]{2,})/(?:jobs|departments|locations)(?:[/?#][^\"'\s<]*)?"),
    ("bamboohr", r"https?://([a-z0-9-]+)\.bamboohr\.com/careers"),
)

_COMPILED_BOARD_LINKS = [(ats, re.compile(p, re.I)) for ats, p in _BOARD_LINK_PATTERNS]

# Tokens that are part of the ATS's own site, not a customer's board.
_BOARD_TOKEN_NOISE = {
    "embed", "job_board", "www", "api", "jobs", "careers", "static", "assets",
    "app", "help", "support", "blog", "about", "search", "images", "img",
    "www", "teamtailor",
}

_CAREERS_PATHS = (
    "/careers",
    "/jobs",
    "/careers/jobs",
    "/about/careers",
    "/company/careers",
    "/company/jobs",
)


def discover_boards_from_site(domain: str) -> list[tuple[str, str]]:
    """Read a company's careers page and return the (ats, slug) pairs it links to.

    This only reads links a company publishes to advertise its own vacancies.
    It does not parse job content out of the page. Best-effort by design: most
    modern careers pages render their board client-side, so this finds a slug
    for a minority of companies — but it is the only thing that finds the
    awkward ones, and a miss costs one fast request.
    """
    if not domain:
        return []

    found: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()

    urls = [f"https://{domain}{path}" for path in _CAREERS_PATHS]
    urls += [f"https://{domain}", f"https://careers.{domain}", f"https://jobs.{domain}"]

    for url in urls:
        body, error = fetch_text(url, cache_hours=24 * 7, timeout=8, retries=1)
        if error or not body:
            continue
        bodies = [body]
        direct = []
        for ats, rx in _COMPILED_BOARD_LINKS:
            direct.extend(rx.finditer(body))
        if not direct:
            hrefs = re.findall(r"""(?:href|content)=["']([^"']*(?:career|job)[^"']*)["']""", body, re.I)
        else:
            hrefs = []
        for href in hrefs[:3]:
            if href.startswith("/"):
                href = f"https://{domain}{href}"
            if not href.startswith("http"):
                continue
            linked, linked_error = fetch_text(href, cache_hours=24 * 7, timeout=8, retries=1)
            if not linked_error and linked:
                bodies.append(linked)
        for ats, rx in _COMPILED_BOARD_LINKS:
            for match in rx.finditer("\n".join(bodies)):
                if ats == "workday":
                    slug = f"{match.group(1)}/{match.group(2)}"
                else:
                    slug = match.group(1)
                if not slug or slug.lower() in _BOARD_TOKEN_NOISE:
                    continue
                key = (ats, slug)
                if key not in seen:
                    seen.add(key)
                    found.append(key)
        if found:
            # The first page that names a board is almost always the right one.
            break

    return found


# ---------------------------------------------------------------------------
# Proving a board belongs to the company we think it does
# ---------------------------------------------------------------------------

def _squash(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


# Words that carry no identity, so "Razorpay Software Private Limited" still
# matches "Razorpay" and "Technologies" alone never matches anything.
_CORPORATE_NOISE = (
    "private", "limited", "pvt", "ltd", "inc", "llc", "corp", "corporation",
    "technologies", "technology", "software", "solutions", "labs", "systems",
    "services", "global", "india", "international", "group", "holdings", "the",
)


def _identity_tokens(name: str) -> set[str]:
    tokens = re.split(r"[^a-z0-9]+", (name or "").lower())
    return {t for t in tokens if t and t not in _CORPORATE_NOISE and len(t) >= 3}


def names_match(a: str, b: str, aliases: tuple[str, ...] = ()) -> bool:
    """True when two company names plausibly refer to the same company."""
    if aliases and any(names_match(a, alias) for alias in aliases):
        return True
    sa, sb = _squash(a), _squash(b)
    if not sa or not sb:
        return False
    if sa == sb:
        return True
    # Substring, but only when the shorter side is long enough to be meaningful.
    shorter, longer = (sa, sb) if len(sa) <= len(sb) else (sb, sa)
    if len(shorter) >= 4 and shorter in longer:
        return True
    ta, tb = _identity_tokens(a), _identity_tokens(b)
    return bool(ta and tb and ta & tb)


def board_identity(ats: str, slug: str) -> str | None:
    """The company name the ATS itself reports for this board, when it exposes one.

    Greenhouse, Workable, Recruitee and SmartRecruiters all name the account.
    Lever and Ashby do not, which is exactly why those two need the weaker
    evidence check below.
    """
    if ats == "greenhouse":
        payload, error = fetch_json(
            f"https://boards-api.greenhouse.io/v1/boards/{slug}", cache_hours=24 * 7
        )
        if error or not isinstance(payload, dict):
            return None
        return payload.get("name")

    if ats == "workable":
        payload, error = fetch_json(workable_url(slug), cache_hours=24 * 7)
        if error or not isinstance(payload, dict):
            return None
        return payload.get("name")

    if ats == "recruitee":
        payload, error = fetch_json(recruitee_url(slug), cache_hours=24 * 7)
        if error or not isinstance(payload, dict):
            return None
        for offer in payload.get("offers", []) or []:
            if offer.get("company_name"):
                return offer["company_name"]
        return None

    if ats == "smartrecruiters":
        payload, error = fetch_json(smartrecruiters_url(slug), cache_hours=24 * 7)
        if error or not isinstance(payload, dict):
            return None
        for posting in payload.get("content", []) or []:
            name = (posting.get("company") or {}).get("name")
            if name:
                return name
        return None

    if ats == "teamtailor":
        payload, error = fetch_json(teamtailor_url(slug), cache_hours=24 * 7)
        if error or not isinstance(payload, dict):
            return None
        return payload.get("title")

    return None


# Boards that exist only so someone could click through a demo. Two of these
# passed a name check convincingly: a Recruitee sandbox named "Google" offering
# "Senior Marketer (Sample)", and a SmartRecruiters account named "Uber" whose
# only posting was "Test UAT".
_TEST_POSTING_RE = re.compile(
    r"\b(sample|test|testing|uat|demo|dummy|placeholder|do not apply|ignore this)\b", re.I
)


def _looks_like_test_board(jobs: list[Job]) -> bool:
    if not jobs:
        return True
    flagged = sum(1 for j in jobs if _TEST_POSTING_RE.search(j.title or ""))
    # A big board with one oddly-named role is fine; a tiny board that is all
    # test postings is a sandbox.
    if len(jobs) <= 3 and flagged == len(jobs):
        return True
    return flagged / len(jobs) > 0.6


def verify_board(
    ats: str,
    slug: str,
    company_name: str,
    domain: str | None = None,
    tags: tuple[str, ...] = (),
    aliases: tuple[str, ...] = (),
) -> dict:
    """Decide whether a detected board really belongs to this company.

    Weighs several independent signals rather than trusting any one of them,
    because each can be fooled on its own. A name match alone said yes to a
    pizza company called Slice when the registry meant the Indian fintech, and
    to a San Francisco startup called Navi when the registry meant the Indian
    one. What separated them was geography: an Indian company's board that
    contains no Indian jobs is not that company's board.

    Returns a verdict with its evidence, so the health report can explain every
    company it dropped instead of silently shrinking the board.
    """
    jobs, error = fetch_ats(ats, slug, company_name, cache_hours=24 * 7)
    if error:
        return {"ok": False, "confidence": "none", "why": f"board unreachable ({error})"}
    if not jobs:
        return {"ok": False, "confidence": "none", "why": "board answered but has no postings"}

    if _looks_like_test_board(jobs):
        return {
            "ok": False,
            "confidence": "none",
            "why": f"board looks like a demo account ({jobs[0].title!r})",
        }

    score = 0
    evidence: list[str] = []

    reported = board_identity(ats, slug)
    if reported:
        if not names_match(reported, company_name, aliases):
            return {
                "ok": False,
                "confidence": "none",
                "why": f"board is named '{reported}', not '{company_name}'",
            }
        score += 3
        evidence.append(f"board is named '{reported}'")

    sample = jobs[:12]

    # Only the domain root counts as a URL signal. Using the company name here
    # let a pizza company's `slice.careers` postings pass as the Indian fintech
    # `sliceit.com`, because "slice" is a word before it is an identity.
    domain_root = _squash(domain.split(".")[0]) if domain else ""
    url_roots = {n for n in (domain_root, *(_squash(a) for a in aliases)) if len(n) >= 4}
    if url_roots:
        url_blob = _squash(" ".join(j.url or "" for j in sample))
        if any(root in url_blob for root in url_roots):
            score += 2
            evidence.append("company domain appears in posting URLs")

    needles = {n for n in (_squash(company_name), domain_root, *(_squash(a) for a in aliases)) if len(n) >= 4}
    if needles:
        hits = sum(
            1 for j in sample if any(n in _squash(j.description_text[:4000]) for n in needles)
        )
        if hits >= max(2, len(sample) // 2):
            score += 1
            evidence.append(f"company named in {hits} of {len(sample)} descriptions")

    # Geography, and this one is decisive. An Indian company with a board full
    # of jobs and not one of them in India is not that company's board — it is
    # a namesake. Rejecting costs one company, listed in the health report;
    # accepting silently files a stranger's jobs under a name you trust.
    if "india" in tags:
        india_jobs = sum(1 for j in jobs if is_india(j.location_raw))
        if india_jobs:
            score += 2
            evidence.append(f"{india_jobs} of {len(jobs)} postings are in India")
        elif len(jobs) >= 5:
            return {
                "ok": False,
                "confidence": "none",
                "why": f"no Indian postings on an Indian company's board ({len(jobs)} jobs) — probably a namesake",
            }

    if score >= 4:
        confidence = "verified"
    elif score >= 2:
        confidence = "likely"
    else:
        return {
            "ok": False,
            "confidence": "none",
            "why": "; ".join(evidence) or "no evidence this board belongs to them",
        }

    return {"ok": True, "confidence": confidence, "why": "; ".join(evidence)}

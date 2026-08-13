"""Getting to a human, without scraping anyone.

The honest constraint: LinkedIn profile data is behind an auth wall, and
harvesting personal email addresses is both legally fraught and, in practice,
how you end up with a list of bounced guesses. So this module never fetches a
profile and never claims to know an address.

What it does instead is everything you can do from public data:

* build LinkedIn searches that land on the specific people who would hire you,
  which is one click and always works because LinkedIn is doing the search;
* read the company's mail setup from DNS, which tells you whether the domain
  receives mail at all and who runs it;
* derive the company's address *pattern* from addresses the company itself has
  published, and otherwise rank the standard patterns by how common they are.

Every address it produces is labelled a guess, with the evidence attached.
"""

from __future__ import annotations

import re
from collections import Counter
from urllib.parse import quote_plus

from .net import fetch_json

# ---------------------------------------------------------------------------
# LinkedIn: searches, not scrapes
# ---------------------------------------------------------------------------

# Who actually decides. Ordered by how directly they influence a design hire,
# and varied by the seniority of the role you are applying to.
_HIRING_TITLES: dict[str, tuple[str, ...]] = {
    "junior": ("Design Manager", "Senior Product Designer", "Head of Design"),
    "mid": ("Design Manager", "Head of Design", "Design Director"),
    "senior": ("Design Manager", "Head of Design", "Design Director", "VP Design"),
    "lead": ("Head of Design", "Design Director", "VP Design"),
    "staff": ("Head of Design", "Design Director", "VP Design"),
    "principal": ("Design Director", "VP Design", "Chief Design Officer"),
    "manager": ("Design Director", "VP Design", "Head of Product"),
    "head": ("VP Design", "Chief Product Officer", "Chief Design Officer"),
    "director": ("VP Design", "Chief Product Officer", "Chief Design Officer"),
    "executive": ("Chief Product Officer", "Chief Executive Officer", "Chief Design Officer"),
}

_DEFAULT_TITLES = ("Design Manager", "Head of Design", "Design Director")


def linkedin_slug(company: str) -> str:
    """LinkedIn's company URLs are usually the hyphenated name."""
    slug = re.sub(r"[^a-z0-9]+", "-", (company or "").lower()).strip("-")
    return slug


def _people_search(*terms: str) -> str:
    query = " ".join(f'"{t}"' for t in terms if t)
    return f"https://www.linkedin.com/search/results/people/?keywords={quote_plus(query)}"


def linkedin_links(company: str, seniority: str = "mid") -> dict:
    """One-click routes to the people who matter for this specific job.

    LinkedIn runs the search, so nothing here breaks when their markup changes
    and nothing is fetched on your behalf.
    """
    slug = linkedin_slug(company)
    titles = _HIRING_TITLES.get(seniority, _DEFAULT_TITLES)

    searches = [
        {"label": title, "url": _people_search(title, company), "kind": "decision-maker"}
        for title in titles
    ]
    searches.append(
        {
            "label": "Design recruiter",
            "url": _people_search("Recruiter", "Design", company),
            "kind": "recruiter",
        }
    )
    searches.append(
        {
            "label": "Designers who could refer you",
            "url": _people_search("Product Designer", company),
            "kind": "referral",
        }
    )

    return {
        "company_page": f"https://www.linkedin.com/company/{slug}/",
        "people": f"https://www.linkedin.com/company/{slug}/people/",
        "jobs": f"https://www.linkedin.com/company/{slug}/jobs/",
        "searches": searches,
    }


# ---------------------------------------------------------------------------
# Mail: what DNS will tell you for free
# ---------------------------------------------------------------------------

_MX_PROVIDERS: tuple[tuple[str, str], ...] = (
    ("google.com", "Google Workspace"),
    ("googlemail.com", "Google Workspace"),
    ("outlook.com", "Microsoft 365"),
    ("protection.outlook.com", "Microsoft 365"),
    ("pphosted.com", "Proofpoint"),
    ("mimecast.com", "Mimecast"),
    ("zoho.com", "Zoho Mail"),
    ("zoho.in", "Zoho Mail"),
    ("yandex", "Yandex"),
    ("qq.com", "Tencent"),
    ("amazonaws.com", "Amazon WorkMail"),
    ("messagingengine.com", "Fastmail"),
    ("titan.email", "Titan"),
    ("secureserver.net", "GoDaddy"),
)


def mail_setup(domain: str | None) -> dict:
    """Ask public DNS whether the domain takes mail, and who runs it.

    Uses DNS-over-HTTPS so the crawl needs no resolver library and works the
    same in CI. Knowing the provider is genuinely useful: Google Workspace
    domains reject unknown recipients outright, so a wrong guess bounces
    immediately rather than vanishing.
    """
    if not domain:
        return {"accepts_mail": False, "provider": None, "checked": False}

    payload, error = fetch_json(
        f"https://dns.google/resolve?name={quote_plus(domain)}&type=MX",
        cache_hours=24 * 14,
    )
    if error or not isinstance(payload, dict):
        return {"accepts_mail": False, "provider": None, "checked": False}

    answers = [a.get("data", "") for a in payload.get("Answer", []) or []]
    if not answers:
        return {"accepts_mail": False, "provider": None, "checked": True}

    blob = " ".join(answers).lower()
    provider = next((label for needle, label in _MX_PROVIDERS if needle in blob), "Other")
    return {"accepts_mail": True, "provider": provider, "checked": True, "records": answers[:4]}


# ---------------------------------------------------------------------------
# Address patterns
# ---------------------------------------------------------------------------

# Rough prevalence across corporate domains. Used only to order the guesses.
PATTERN_LIBRARY: tuple[tuple[str, str, int], ...] = (
    ("{first}.{last}", "first.last", 40),
    ("{first}", "first", 20),
    ("{f}{last}", "flast", 14),
    ("{first}{last}", "firstlast", 8),
    ("{first}_{last}", "first_last", 6),
    ("{first}{l}", "firstl", 5),
    ("{last}.{first}", "last.first", 4),
    ("{f}.{last}", "f.last", 3),
)

_EMAIL_RE = re.compile(r"\b[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})\b", re.I)

# Addresses that are a department, not a person, and so reveal nothing about
# how the company names its people.
_ROLE_LOCALPARTS = {
    "info", "hello", "contact", "support", "help", "sales", "careers", "jobs",
    "hr", "press", "media", "legal", "privacy", "security", "admin", "team",
    "hi", "enquiries", "inquiries", "recruitment", "talent", "noreply",
    "no-reply", "donotreply", "marketing", "partnerships", "billing", "abuse",
    "webmaster", "postmaster", "office", "general", "feedback", "care",
}


def _pattern_of(localpart: str) -> str | None:
    """Which template does this real address follow?"""
    lp = localpart.lower()
    if "." in lp:
        left, _, right = lp.partition(".")
        if len(left) == 1:
            return "{f}.{last}"
        if len(right) == 1:
            return "{first}.{l}"
        return "{first}.{last}"
    if "_" in lp:
        return "{first}_{last}"
    return None


def observed_patterns(texts: list[str], domain: str | None) -> list[str]:
    """Patterns inferred from addresses the company has already published.

    A single real address in a job description settles what a hundred
    prevalence statistics can only guess at.
    """
    if not domain:
        return []
    root = domain.lower()
    counter: Counter[str] = Counter()
    for text in texts:
        for match in _EMAIL_RE.finditer(text or ""):
            if not match.group(1).lower().endswith(root):
                continue
            localpart = match.group(0).split("@", 1)[0]
            if localpart.lower() in _ROLE_LOCALPARTS:
                continue
            pattern = _pattern_of(localpart)
            if pattern:
                counter[pattern] += 1
    return [pattern for pattern, _ in counter.most_common(2)]


def render_pattern(pattern: str, first: str, last: str, domain: str) -> str:
    first, last = first.lower().strip(), last.lower().strip()
    return pattern.format(
        first=first,
        last=last,
        f=first[:1],
        l=last[:1],
    ) + f"@{domain}"


def email_guesses(
    domain: str | None,
    *,
    evidence_texts: list[str] | None = None,
) -> dict:
    """Ranked address patterns for a company, with an explicit confidence.

    Never returns an address for a named person, because this pipeline does not
    know any named people. It returns the shape of the company's addresses, so
    that once LinkedIn has told you who to write to, you can construct the
    address yourself and let the mail server confirm it.
    """
    if not domain:
        return {
            "domain": None,
            "confidence": "none",
            "patterns": [],
            "note": "No company domain known, so no address pattern can be inferred.",
        }

    mail = mail_setup(domain)
    observed = observed_patterns(evidence_texts or [], domain)

    ranked: list[dict] = []
    for pattern in observed:
        label = next((lbl for tpl, lbl, _ in PATTERN_LIBRARY if tpl == pattern), pattern)
        ranked.append({"pattern": pattern, "label": label, "source": "observed"})

    for template, label, weight in PATTERN_LIBRARY:
        if template in observed:
            continue
        ranked.append(
            {"pattern": template, "label": label, "source": "prevalence", "weight": weight}
        )

    if observed:
        confidence = "observed"
        note = (
            "Pattern taken from an address this company has published itself. "
            "Still worth verifying before you send."
        )
    elif mail["accepts_mail"]:
        confidence = "guess"
        note = (
            f"No published address found, so these are the standard patterns, most common first. "
            f"The domain does accept mail ({mail['provider']}), so a wrong guess should bounce "
            "quickly rather than disappear."
        )
    elif mail.get("checked"):
        confidence = "unusable"
        note = "This domain has no mail records, so do not expect any address at it to work."
    else:
        # The DNS query itself failed. That is not evidence of anything about
        # the domain, and reporting it as "no mail records" would talk you out
        # of a working outreach route because a network call timed out.
        confidence = "guess"
        note = (
            "No published address found, so these are the standard patterns, most common "
            "first. The mail-server check did not complete this crawl, so treat a silent "
            "send as unproven rather than delivered."
        )

    return {
        "domain": domain,
        "confidence": confidence,
        "mail": mail,
        "patterns": ranked[:6],
        "note": note,
    }

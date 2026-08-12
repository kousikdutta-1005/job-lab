"""What counts as a design job, how senior it is, and where you can actually take it.

Everything here is a judgement call written down. Keeping the rules in one file
means the board can explain *why* a job was included or scored the way it was,
instead of asking anyone to trust a number.
"""

from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# What counts as a design role
# ---------------------------------------------------------------------------

# A title has to match one of these to enter the board at all. They are matched
# against a lowercased, punctuation-normalised title.
INCLUDE_TITLE_PATTERNS: tuple[str, ...] = (
    r"\bux\b",
    r"\bui\b",
    r"\bui/?ux\b",
    r"\bux/?ui\b",
    r"product design",
    r"\bproduct designer\b",
    r"experience design",
    r"interaction design",
    r"\bvisual design(er)?\b",
    r"\bdesign(er)? systems?\b",
    r"\bdesign systems?\b",
    r"\bdesign lead\b",
    r"\bdesign manager\b",
    r"\bdesign director\b",
    r"\bhead of design\b",
    r"\bdirector of design\b",
    r"\bvp,? design\b",
    r"\bvice president,? design\b",
    r"\bchief design officer\b",
    r"\bdesign engineer\b",
    r"\bdesign technologist\b",
    r"\bux engineer\b",
    r"\bux writer\b",
    r"\bcontent design(er)?\b",
    r"\bux research(er)?\b",
    r"\buser research(er)?\b",
    r"\bdesign research(er)?\b",
    r"\bservice design(er)?\b",
    r"\bbrand design(er)?\b",
    r"\bcreative director\b",
    r"\bdesign strateg(y|ist)\b",
    r"\bmotion design(er)?\b",
    r"\bdesign ops\b",
    r"\bdesignops\b",
    # Bare "Designer" and "Senior Designer" — real titles at product companies.
    r"^(senior |sr\.? |staff |principal |lead |associate |junior |jr\.? )*designer$",
)

# Titles that contain a design word but are a different profession. Checked
# after the include list, and they win.
EXCLUDE_TITLE_PATTERNS: tuple[str, ...] = (
    r"\bmechanical\b",
    r"\belectrical\b",
    r"\bcircuit\b",
    r"\bpcb\b",
    r"\bcad\b",
    r"\bstructural\b",
    r"\bcivil\b",
    r"\barchitectural\b",
    r"\binterior design(er)?\b",
    r"\bfashion design(er)?\b",
    r"\btextile\b",
    r"\bjewell?ery\b",
    r"\bgarment\b",
    r"\bindustrial design(er)?\b",
    r"\binstructional design(er)?\b",
    r"\bcurriculum design(er)?\b",
    r"\bgame level design(er)?\b",
    r"\blevel design(er)?\b",
    r"\bsound design(er)?\b",
    r"\baudio design(er)?\b",
    r"\bpackaging design(er)?\b",
    r"\bsemiconductor\b",
    r"\bvlsi\b",
    r"\brtl\b",
    r"\bchip\b",
    # Hardware roles that legitimately carry the words "design engineer".
    # OpenAI's "Actuator Gear Design Engineer" and two of its siblings were
    # sitting on a UX board and, because they pay Bay Area robotics money,
    # dragging the mid-level pay median up to ₹2.7 crore.
    r"\bactuator\b",
    r"\belectromagnetic\b",
    r"\brobotic(s)?\b",
    r"\bhardware\b",
    r"\bfirmware\b",
    r"\bthermal\b",
    r"\bgear\b",
    r"\bmotor\b",
    r"\bbattery\b",
    r"\boptical\b",
    r"\bantenna\b",
    r"\basic\b",
    r"\bfpga\b",
    r"\bembedded\b",
    r"\bmanufactur(e|ing)\b",
    r"\btooling\b",
    r"\bmould|\bmold\b",
    r"\bnetwork design(er)?\b",
    r"\bprocess design(er)?\b",
    # Recruiting for a design role is not a design role.
    r"\brecruiter\b",
    r"\btalent acquisition\b",
    r"\bsales\b",
    r"\baccount executive\b",
    # Internships and apprenticeships are noise for an experienced designer.
    r"\bintern\b",
    r"\binternship\b",
    r"\bapprentice(ship)?\b",
    r"\btrainee\b",
    r"\bfresher\b",
)

_INCLUDE_RE = [re.compile(p, re.I) for p in INCLUDE_TITLE_PATTERNS]
_EXCLUDE_RE = [re.compile(p, re.I) for p in EXCLUDE_TITLE_PATTERNS]


def normalise_title(title: str) -> str:
    """Lowercase, collapse punctuation and whitespace so patterns match reliably."""
    t = (title or "").lower()
    t = t.replace("\u2013", "-").replace("\u2014", "-").replace("\u2019", "'")
    t = re.sub(r"[(),\[\]|/·•]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def is_design_role(title: str) -> bool:
    """True when the title is a UX, product or adjacent design role."""
    t = normalise_title(title)
    if not t:
        return False
    if any(r.search(t) for r in _EXCLUDE_RE):
        return False
    return any(r.search(t) for r in _INCLUDE_RE)


# ---------------------------------------------------------------------------
# Seniority
# ---------------------------------------------------------------------------

# Ordered most-specific first, because "senior staff designer" must not match
# "senior" before it matches "staff".
SENIORITY_LADDER: tuple[tuple[str, str, int, int], ...] = (
    # (key, label, typical_min_years, typical_max_years)
    ("executive", "Executive", 15, 40),
    ("director", "Director", 10, 25),
    ("head", "Head of Design", 9, 22),
    ("manager", "Manager", 6, 16),
    ("principal", "Principal", 10, 25),
    ("staff", "Staff", 7, 15),
    ("lead", "Lead", 6, 14),
    ("senior", "Senior", 4, 9),
    ("mid", "Mid-level", 2, 6),
    ("junior", "Junior", 0, 3),
)

SENIORITY_PATTERNS: tuple[tuple[str, str], ...] = (
    ("executive", r"\b(chief|cdo|c-level|vp|vice president|svp|evp)\b"),
    ("director", r"\bdirector\b"),
    ("head", r"\bhead of\b"),
    ("manager", r"\b(manager|managing)\b"),
    ("principal", r"\bprincipal\b"),
    ("staff", r"\bstaff\b"),
    ("lead", r"\b(lead|leader)\b"),
    ("senior", r"\b(senior|sr\.?|snr)\b"),
    ("junior", r"\b(junior|jr\.?|associate|entry.level|graduate)\b"),
)

_SENIORITY_RE = [(k, re.compile(p, re.I)) for k, p in SENIORITY_PATTERNS]

SENIORITY_META = {k: (label, lo, hi) for k, label, lo, hi in SENIORITY_LADDER}
SENIORITY_ORDER = [k for k, _, _, _ in SENIORITY_LADDER]


def seniority_from_title(title: str) -> str:
    """Best-guess seniority key from the title alone. Defaults to mid-level.

    An unmarked "Product Designer" at a product company is a mid-level role, not
    a junior one, so the default sits at mid rather than at the bottom.
    """
    t = normalise_title(title)
    for key, rx in _SENIORITY_RE:
        if rx.search(t):
            return key
    return "mid"


# Years of experience, as written in job descriptions. Ordered so that ranges
# are tried before open-ended minimums.
_YEARS_PATTERNS = (
    # "5-8 years", "5 to 8 years", "5–8 yrs"
    re.compile(r"(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\+?\s*(?:\+)?\s*(?:years?|yrs?)\b", re.I),
    # "minimum of 5 years", "at least 5 years", "5+ years"
    re.compile(r"(?:minimum|at least|min\.?|over|more than)\s*(?:of\s*)?(\d{1,2})\+?\s*(?:years?|yrs?)\b", re.I),
    re.compile(r"(\d{1,2})\s*\+\s*(?:years?|yrs?)\b", re.I),
    re.compile(r"\b(\d{1,2})\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+|professional\s+|industry\s+)?experience\b", re.I),
)


def years_required(text: str) -> tuple[int | None, int | None]:
    """Pull a years-of-experience range out of a job description.

    Returns (min, max); either side may be None. Scans only the first slice of
    the description because requirements appear early and later mentions are
    usually about the company's age or a tool's version.
    """
    if not text:
        return (None, None)
    window = text[:6000]
    for rx in _YEARS_PATTERNS:
        m = rx.search(window)
        if not m:
            continue
        groups = [g for g in m.groups() if g is not None]
        if len(groups) == 2:
            lo, hi = int(groups[0]), int(groups[1])
            if 0 <= lo <= hi <= 30:
                return (lo, hi)
        elif len(groups) == 1:
            lo = int(groups[0])
            if 0 <= lo <= 30:
                return (lo, None)
    return (None, None)


# ---------------------------------------------------------------------------
# Where the job is
# ---------------------------------------------------------------------------

INDIA_CITIES: dict[str, tuple[str, ...]] = {
    "Bengaluru": ("bengaluru", "bangalore", "blr", "bangalore urban", "whitefield", "koramangala"),
    "Delhi NCR": ("delhi", "new delhi", "gurgaon", "gurugram", "noida", "ncr", "faridabad", "ghaziabad"),
    "Mumbai": ("mumbai", "bombay", "navi mumbai", "thane", "powai", "andheri", "bkc"),
    "Hyderabad": ("hyderabad", "secunderabad", "hitec city", "telangana"),
    "Pune": ("pune", "pimpri", "hinjewadi", "kharadi"),
    "Chennai": ("chennai", "madras", "omr"),
    "Kolkata": ("kolkata", "calcutta", "salt lake"),
    "Ahmedabad": ("ahmedabad", "gandhinagar", "gift city"),
    "Jaipur": ("jaipur",),
    "Indore": ("indore",),
    "Kochi": ("kochi", "cochin", "ernakulam", "kerala"),
    "Chandigarh": ("chandigarh", "mohali", "panchkula"),
    "Coimbatore": ("coimbatore",),
    "Bhubaneswar": ("bhubaneswar", "odisha"),
    "Goa": ("goa", "panaji"),
}

INDIA_TOKENS: tuple[str, ...] = ("india", "bharat", "in-", "ind ")

REMOTE_TOKENS: tuple[str, ...] = (
    "remote",
    "anywhere",
    "work from home",
    "wfh",
    "distributed",
    "location independent",
    "fully remote",
    "remote-first",
)

HYBRID_TOKENS: tuple[str, ...] = ("hybrid", "flexible", "partially remote")
ONSITE_TOKENS: tuple[str, ...] = ("on-site", "onsite", "in office", "in-office", "on site")

# A "remote" job is usually remote *within one country*. These patterns catch the
# restriction so the board can tell you when you are not actually eligible —
# the single most common way a remote job board wastes your time.
REGION_LOCKS: tuple[tuple[str, str], ...] = (
    ("US", r"\b(us|u\.s\.|usa|united states|america)\s*(only|based|remote|-based)\b"),
    ("US", r"\bremote\s*[-–—(,:|]?\s*(us|u\.s\.|usa|united states)\b"),
    ("US", r"\b(must|required to)\s+(be\s+)?(located|reside|live|based)\s+in\s+the\s+(us|united states)\b"),
    ("US", r"\b(authoriz|authoris)ed to work in the (us|united states)\b"),
    ("US", r"\bw2\b"),
    ("US", r"\b(green card|us citizen)\b"),
    ("NA", r"\bnorth america\b"),
    ("NA", r"\bamericas\b"),
    ("CA", r"\bremote\s*[-–—(,:|]?\s*canada\b"),
    ("CA", r"\bcanada\s*(only|based)\b"),
    ("UK", r"\b(uk|united kingdom|england|britain)\s*(only|based|-based)\b"),
    ("UK", r"\bremote\s*[-–—(,:|]?\s*(uk|united kingdom)\b"),
    ("UK", r"\bright to work in the (uk|united kingdom)\b"),
    ("EU", r"\b(eu|europe|emea)\s*(only|based|-based|timezones?)\b"),
    ("EU", r"\bremote\s*[-–—(,:|]?\s*(eu|europe|emea)\b"),
    ("EU", r"\bwithin the (eu|european union)\b"),
    ("AU", r"\b(australia|anz)\s*(only|based)\b"),
    ("SG", r"\bsingapore\s*(only|based)\b"),
    ("LATAM", r"\b(latam|latin america)\s*(only|based)\b"),
)

_REGION_LOCK_RE = [(code, re.compile(p, re.I)) for code, p in REGION_LOCKS]

# Where you can actually work. Anything not in here gets flagged as ineligible
# rather than silently dropped, because a wrong exclusion is worse than a
# labelled long shot.
ELIGIBLE_REGIONS: tuple[str, ...] = ("IN", "GLOBAL", "APAC")

# Signals that a remote role is genuinely open worldwide.
GLOBAL_REMOTE_TOKENS: tuple[str, ...] = (
    "remote worldwide",
    "worldwide",
    "anywhere in the world",
    "work from anywhere",
    "global remote",
    "remote - global",
    "remote (global)",
    "any timezone",
    "location: anywhere",
)


# ---------------------------------------------------------------------------
# Design vocabulary, used for resume matching and JD keyword extraction
# ---------------------------------------------------------------------------

# Grouped so the resume matcher can say *what kind* of gap it found, not just
# that a string was missing.
DESIGN_LEXICON: dict[str, tuple[str, ...]] = {
    "tools": (
        "figma", "sketch", "adobe xd", "framer", "webflow", "principle", "protopie",
        "invision", "zeplin", "abstract", "miro", "figjam", "whimsical", "balsamiq",
        "axure", "after effects", "illustrator", "photoshop", "lottie", "rive",
        "spline", "blender", "cinema 4d", "storybook", "notion", "linear", "jira",
        "confluence", "maze", "usertesting", "dovetail", "hotjar", "fullstory",
        "amplitude", "mixpanel", "looker", "google analytics", "optimal workshop",
    ),
    "craft": (
        "wireframing", "prototyping", "high fidelity", "low fidelity", "visual design",
        "interaction design", "motion design", "microinteractions", "typography",
        "color theory", "layout", "grid system", "iconography", "illustration",
        "responsive design", "mobile first", "information architecture", "user flows",
        "journey mapping", "storyboarding", "sketching", "concept development",
    ),
    "systems": (
        "design system", "component library", "design tokens", "atomic design",
        "pattern library", "style guide", "brand guidelines", "documentation",
        "governance", "theming", "variants", "auto layout", "figma variables",
        "tokens studio", "multi brand", "accessibility annotations", "handoff",
    ),
    "research": (
        "user research", "usability testing", "user interviews", "contextual inquiry",
        "surveys", "card sorting", "tree testing", "a/b testing", "multivariate",
        "heuristic evaluation", "cognitive walkthrough", "diary study", "ethnography",
        "persona", "jobs to be done", "empathy map", "affinity mapping",
        "quantitative research", "qualitative research", "synthesis", "insight",
    ),
    "process": (
        "double diamond", "design thinking", "agile", "scrum", "kanban", "sprint",
        "design sprint", "discovery", "definition", "iteration", "critique",
        "design review", "stakeholder management", "cross functional", "roadmap",
        "prioritisation", "prioritization", "okrs", "kpis", "north star metric",
    ),
    "accessibility": (
        "accessibility", "a11y", "wcag", "aria", "screen reader", "contrast ratio",
        "keyboard navigation", "inclusive design", "assistive technology", "section 508",
    ),
    "technical": (
        "html", "css", "javascript", "typescript", "react", "vue", "svelte",
        "tailwind", "design engineering", "front end", "frontend", "api", "sql",
        "git", "github", "version control", "responsive", "web performance",
    ),
    "domain": (
        "b2b", "b2c", "saas", "enterprise", "fintech", "healthtech", "edtech",
        "e-commerce", "ecommerce", "marketplace", "consumer", "platform", "developer tools",
        "data visualization", "data visualisation", "dashboard", "analytics",
        "ai", "machine learning", "llm", "generative ai", "agentic", "conversational",
    ),
    "leadership": (
        "mentoring", "coaching", "hiring", "team building", "people management",
        "design leadership", "vision", "strategy", "influence", "presenting",
        "facilitation", "workshop", "evangelism", "advocacy",
    ),
}

# Flattened, longest-first so "design system" matches before "design".
ALL_LEXICON_TERMS: tuple[str, ...] = tuple(
    sorted({t for group in DESIGN_LEXICON.values() for t in group if t}, key=len, reverse=True)
)

TERM_TO_GROUP: dict[str, str] = {
    term: group for group, terms in DESIGN_LEXICON.items() for term in terms if term
}


def detect_region_lock(*texts: str) -> str | None:
    """Return a region code when the posting restricts where you may live."""
    blob = " ".join(t for t in texts if t)[:8000]
    for code, rx in _REGION_LOCK_RE:
        if rx.search(blob):
            return code
    return None

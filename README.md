# job-lab

A private career desk built entirely on job data that companies publish themselves.

It reads the applicant tracking systems companies already expose, keeps the design
roles a person in India could actually take, scores them against your resume in
your own browser, works out who to write to, and remembers everything you have
sent. It runs on GitHub Actions and GitHub Pages, costs nothing, and has no
server, no database and no API keys.

Live at [kousikdutta-1005.github.io/job-lab](https://kousikdutta-1005.github.io/job-lab/).

## Why not just use a job board

Because job boards are somebody else's incentives. Aggregators are paid for the
click, so they show you stale listings, the same role four times, and roles you
are not allowed to take. The single most common lie is the word *remote*: most
remote jobs are remote **within one country**, and no aggregator will tell you
which.

So this reads the source instead. Every posting here comes from the ATS the
company publishes its own vacancies through — Greenhouse, Lever, Ashby, Workable,
SmartRecruiters, Recruitee — plus four open aggregators for the long tail. Those
endpoints are public, documented, unauthenticated, and never wrong about whether
a role is still open.

## What it refuses to do

The interesting work was in the negatives.

**It refuses to trust a board it cannot prove.** Guessing a company's board token
from its name is right often enough to be dangerous. Early runs confidently
matched a Recruitee sandbox account named "Google" whose only posting was
*Senior Marketer (Sample)*, a SmartRecruiters test account named "Uber" offering
*Test UAT*, a pizza company called Slice when the registry meant the Indian
fintech, and a San Francisco startup called Navi when it meant the Indian one.

A board now has to survive three checks: it must not look like a demo account,
its self-reported name must match, and — for a company the registry says is
Indian — it must actually contain Indian jobs. That last check is the one that
catches namesakes, because a board full of vacancies with none of them in India
is not an Indian company's board. Rejections are listed in the health report with
their reason rather than silently dropped.

**It refuses to call a foreign remote job available to you.** "Remote — United
States", "San Francisco, CA (Remote)" and "North America (Remote)" were all being
offered as jobs you could take from Bengaluru. A remote role whose location names
a country other than India is now treated as remote *within that country* unless
it explicitly says worldwide.

**It refuses to print a salary band from too small a sample.** Anything under
three disclosed postings is not reported at all. And it never blends markets:
Indian employers disclose pay in essentially zero postings, so the crawled bands
are almost entirely American, and quoting them as your negotiation anchor would
be actively harmful. Published benchmarks are a separate, cited tier, and every
figure says which tier it came from.

**It refuses to scrape LinkedIn.** Profile data is behind an auth wall and
harvesting personal email addresses is both legally fraught and, in practice, a
list of bounces. Instead it builds LinkedIn searches pre-filtered to the company
and the titles that would hire you, reads the company's mail setup from public
DNS, and infers the address *pattern* from addresses the company has published
itself. Every address it shows is labelled a guess, with its evidence.

**It refuses to submit applications for you.** The autofill bookmarklet fills the
tedious fields and then stops. Mass-applied applications are recognisable and get
binned; the fields are worth automating, the answers are not.

## The bugs that shaped it

Each of these shipped broken first, which is why the code comments explain the
failure rather than the mechanism.

- **`Offe(rs )Equity`.** Currency detection matched substrings, and the token
  `"rs "` appears inside "Offers Equity". Every `$130K – $180K` band was
  therefore filed as rupees, putting Bay Area salaries below Indian ones on the
  same axis.
- **Escaped HTML.** `html_to_text` stripped tags and *then* unescaped entities.
  Greenhouse returns its content escaped, so there was nothing to strip until
  after the unescape, and 84 job descriptions rendered as literal `<div>` markup.
  The build now fails loudly if any description contains markup.
- **`Actuator Gear Design Engineer`.** OpenAI's robotics roles carry the words
  "design engineer", so they sat on a UX board — and because they pay Bay Area
  robotics money, they dragged the mid-level pay median up to ₹2.7 crore.
- **A banner across India.** Map labels were sized in viewBox units divided by
  the square root of the zoom, which looks correct at 1× and renders "Delhi NCR"
  across half the subcontinent at 6.5×.
- **`urls[Github / Stack Overflow]`.** The autofill bookmarklet matched any field
  whose label contained "url", so it wrote the portfolio link into every social
  field on a Lever form.

## The map

Drawn as inline SVG from Natural Earth's public-domain 1:110m coastlines,
simplified to 156 KB. There is no tile provider, no API key, no attribution
overlay and no per-view cost. Remote roles have no coordinates, so they are
counted in their own panel rather than invented onto a pin.

## The autofill bookmarklet

A page on this origin cannot touch a form on `boards.greenhouse.io`; browsers
forbid it, correctly. Extensions get around that with permissions this tool does
not want. A bookmarklet inverts the problem — it runs in the ATS page's own
origin because you launched it there — so your details are baked into the
bookmarklet itself at generation time.

It is tested against HTML fetched from live Greenhouse and Lever postings rather
than a fixture, because the entire risk is that a real form is shaped differently
from the one you imagined.

```bash
cd web && node test/autofill.test.mjs --refresh
```

## Running it

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/python cli.py build     # crawl, score, write static JSON

cd web
npm install
npm run dev                          # http://localhost:5173
node test/smoke.test.mjs             # drives a real browser through every view
```

`cli.py` also has `detect`, `health`, `news`, `trends`, `relocation`, `insights`
and `benchmarks` subcommands.

## Layout

| Path | What |
|---|---|
| `joblab/sources/` | ATS and aggregator readers, board verification |
| `joblab/config.py` | What counts as a design role, and what does not |
| `joblab/geo.py` | Whether you can actually take the job |
| `joblab/salary.py` | Pay parsing, and the bands it declines to report |
| `joblab/insights.py` | The career advice layer |
| `data/companies.yaml` | The seed registry — one line per company |
| `data/benchmarks.yaml` | Published salary bands, each with its source |
| `data/history/` | A nightly snapshot; the only memory the system has |
| `web/src/lib/resume.ts` | ATS resume matching, entirely in your browser |
| `web/src/lib/autofill.ts` | The bookmarklet generator |
| `web/src/lib/briefing.ts` | What to do today, and why |

## Privacy

Your resume, applications, contacts and settings are held in your browser's local
storage. They are never uploaded, never committed, and never leave your machine —
which is also why there is no backup but the export button in Settings.

The login is a PBKDF2 hash checked client-side. It is a lock, not a vault: it
keeps the board private from anyone who wanders past the URL, and nothing
personal is ever built into the bundle, so that is all it needs to be.

## Licence

Code is free to learn from. The registry, benchmark table and writing are mine.

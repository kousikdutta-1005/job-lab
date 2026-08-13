# ATS endpoint investigations

These platforms were checked while expanding coverage. They stay out of
`joblab/sources/ats.py` unless there is a stable, public, no-auth JSON endpoint
that returns real postings and enough identity/location data to verify a board.

- Freshteam: public customer pages such as `browserstack.freshteam.com/jobs`
  returned HTML, and `jobs.json` did not return JSON. Rejected for now because
  parsing rendered HTML would weaken the crawler's machine-readable-source rule.
- Teamtailor: added. Tenant feeds expose a public JSON Feed at
  `https://{tenant}/jobs.json` with schema.org JobPosting data, including
  hiring organization, posting URL, description, date and locations. Verified
  against `career.teamtailor.com/jobs.json`.
- BambooHR: added. Public boards expose `https://{tenant}.bamboohr.com/careers/list`
  and per-job unauthenticated JSON at `/careers/{id}/detail`. The verifier keeps
  the demo-account rejection because BambooHR tenants often leave sample jobs
  online.
- Personio: `*.jobs.personio.de/xml` and `search.json` routes returned a Vercel
  Security Checkpoint / HTTP 429 in this environment. Rejected for automation
  until the public XML endpoint can be fetched reliably from GitHub Actions.
- Jobvite: public pages redirected invalid tenants to job-seeker support and no
  stable no-auth JSON endpoint was verified during this pass. Rejected until a
  concrete tenant API URL is proven.
- iCIMS: many tenants expose HTML careers portals, but no shared public JSON
  contract with enough identity/location data was verified in this pass.
- Darwinbox: public career pages vary by tenant and did not expose a consistent
  unauthenticated JSON jobs endpoint during this pass. Rejected until a stable
  public endpoint is verified.
- Keka: public careers pages are tenant-specific and did not expose a consistent
  no-auth JSON endpoint during this pass. Rejected until one is verified.
- Zoho Recruit: public pages exist, but the no-auth endpoints vary by portal and
  did not produce a stable JSON shape suitable for strict verification in this
  pass.
- SuccessFactors, Phenom, iCIMS and Taleo: many deployments expose HTML search
  pages or site-specific APIs, but no single public JSON contract was verified
  here without scraping rendered pages. Keep investigating per-company before
  adding platform code.

## India/APAC aggregator investigations

- Wellfound / AngelList Talent: public pages rendered only login/marketing HTML in
  this environment and no stable no-auth JSON/RSS endpoint was verified. Not
  added; scraping authenticated or anti-bot pages would violate the architecture.
- Y Combinator Work at a Startup: the companies page returned HTML/406 depending
  on headers and no stable public JSON contract was verified in this pass. Not
  added until a no-auth jobs endpoint can be cited.
- Instahyre, Cutshort, hirist and Naukri: checked as India-relevant sources, but
  they do not expose a stable public JSON feed suitable for this static crawler;
  several routes are rendered HTML or protected. Not scraped.
- RemoteOK: added through `https://remoteok.com/remote-design-jobs.json`; posting
  URLs remain RemoteOK URLs for attribution/link-back.
- Jobicy: added through `https://jobicy.com/api/v2/remote-jobs?tag=design`; posting
  URLs remain Jobicy URLs for attribution/link-back.
- Hacker News Who is Hiring: added via Algolia's no-key comment API, restricted
  to comments mentioning design roles and India/APAC/worldwide remote eligibility.

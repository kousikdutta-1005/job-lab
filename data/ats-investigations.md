# ATS endpoint investigations

These platforms were checked while expanding coverage. They stay out of
`joblab/sources/ats.py` unless there is a stable, public, no-auth JSON endpoint
that returns real postings and enough identity/location data to verify a board.

- Freshteam: public customer pages such as `browserstack.freshteam.com/jobs`
  returned HTML, and `jobs.json` did not return JSON. Rejected for now because
  parsing rendered HTML would weaken the crawler's machine-readable-source rule.
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

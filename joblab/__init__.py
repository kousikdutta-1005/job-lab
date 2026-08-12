"""job-lab: a nightly crawl of public ATS boards for UX and product design roles.

The whole pipeline is read-only and unauthenticated. It reads job boards that
companies publish deliberately and machine-readably, normalises them into one
shape, and writes static JSON. There is no server and no database.
"""

__version__ = "0.1.0"

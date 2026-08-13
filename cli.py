#!/usr/bin/env python3
"""job-lab command line.

    ./.venv/bin/python cli.py build            # full nightly run
    ./.venv/bin/python cli.py build --redetect # re-probe every company's ATS
    ./.venv/bin/python cli.py detect           # only resolve boards
    ./.venv/bin/python cli.py health           # print the last report
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from joblab.build import OUT_DIR, run
from joblab.benchmarks import export_benchmarks
from joblab.insights import build_insights
from joblab.models import Job
from joblab.news import collect_news
from joblab.registry import load_registry, resolve_boards
from joblab.salary import attach_salaries, benchmarks
from joblab.relocation import build_relocation
from joblab.score import load_profile
from joblab.trends import build_trends


def _load_built_jobs() -> list[Job]:
    path = OUT_DIR / "jobs.json"
    if not path.exists():
        raise FileNotFoundError("No jobs.json yet. Run `build` first.")
    payload = json.loads(path.read_text())
    return [Job(**row) for row in payload.get("jobs", [])]


def _write_json(name: str, payload: dict) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / name).write_text(json.dumps(payload, separators=(",", ":")))


def cmd_build(args: argparse.Namespace) -> int:
    health = run(force_detect=args.redetect, workers=args.workers, write=not args.dry_run)
    counts = health["counts"]

    print(f"job-lab build finished in {health['duration_seconds']}s")
    print(
        f"  {counts['companies_with_board']}/{counts['companies_in_registry']} companies have a verified board"
    )
    print(
        f"  {counts['jobs']} design jobs "
        f"({counts['eligible']} you can take, {counts['ineligible']} region-locked), "
        f"{counts['duplicates_removed']} duplicates merged"
    )
    print(f"  sources: {json.dumps(health['by_source'])}")

    failing = [s for s in health["sources"] if s.get("error")]
    if failing:
        print(f"  {len(failing)} source(s) reported an error:")
        for source in failing[:8]:
            print(f"    - {source['name']}: {source['error']}")

    if counts["jobs"] == 0:
        print("\nNo jobs at all. That is a failure, not an empty day.", file=sys.stderr)
        return 1
    return 0


def cmd_detect(args: argparse.Namespace) -> int:
    companies = load_registry()
    mapping, stats = resolve_boards(companies, workers=args.workers, force=args.redetect)
    print(json.dumps(stats, indent=2))
    for company in companies:
        entry = mapping.get(company.key, {})
        board = f"{entry.get('ats')}/{entry.get('slug')}" if entry.get("ats") else "—"
        print(f"  {company.name:24} {board:44} {entry.get('confidence', '')}")
    return 0


def cmd_health(_: argparse.Namespace) -> int:
    path = OUT_DIR / "health.json"
    if not path.exists():
        print("No health report yet. Run `build` first.", file=sys.stderr)
        return 1
    print(Path(path).read_text())
    return 0


def cmd_news(_: argparse.Namespace) -> int:
    payload, health = collect_news()
    _write_json("news.json", payload)
    print(f"wrote news.json with {len(payload['items'])} item(s)")
    failing = [row for row in health if row.get("error")]
    if failing:
        print(f"{len(failing)} news source(s) reported errors")
    return 0


def cmd_trends(_: argparse.Namespace) -> int:
    payload = build_trends(_load_built_jobs(), write=True)
    _write_json("trends.json", payload)
    print(f"wrote trends.json from {payload['history_days']} history day(s)")
    return 0


def cmd_relocation(_: argparse.Namespace) -> int:
    payload = build_relocation(_load_built_jobs(), profile=load_profile())
    _write_json("relocation.json", payload)
    print(f"wrote relocation.json with {len(payload['cities'])} city row(s)")
    return 0


def cmd_benchmarks(_: argparse.Namespace) -> int:
    payload = export_benchmarks()
    _write_json("benchmarks.json", payload)
    print(json.dumps(payload, indent=2))
    return 0


def cmd_reprice(_: argparse.Namespace) -> int:
    """Re-read pay out of the descriptions we already have.

    The parser improves more often than the postings change, and a full build
    re-fetches several hundred boards to learn nothing new about them. This
    replays the salary stage over the last crawl so a parser fix reaches the
    board in seconds instead of overnight.
    """
    path = OUT_DIR / "jobs.json"
    payload = json.loads(path.read_text())
    jobs = [Job(**row) for row in payload.get("jobs", [])]
    before = sum(1 for job in jobs if job.salary_parsed)

    disclosed = attach_salaries(jobs)
    payload["jobs"] = [job.to_dict() for job in jobs]

    pay = benchmarks(jobs)
    pay["tiers"] = payload.get("pay", {}).get("tiers", {})
    pay["published_benchmarks"] = payload.get("pay", {}).get("published_benchmarks", {})
    payload["pay"] = pay

    path.write_text(json.dumps(payload, separators=(",", ":")))

    total = len(jobs) or 1
    print(
        f"repriced {total} jobs: {before} -> {disclosed} disclose pay "
        f"({100 * disclosed // total}%)"
    )
    return 0


def cmd_insights(_: argparse.Namespace) -> int:
    jobs = _load_built_jobs()
    idf_path = OUT_DIR / "idf.json"
    trends_path = OUT_DIR / "trends.json"
    relocation_path = OUT_DIR / "relocation.json"
    idf = json.loads(idf_path.read_text()) if idf_path.exists() else {}
    trends = json.loads(trends_path.read_text()) if trends_path.exists() else build_trends(jobs, write=True)
    profile = load_profile()
    relocation = json.loads(relocation_path.read_text()) if relocation_path.exists() else build_relocation(jobs, profile=profile)
    payload = build_insights(jobs, profile, idf, trends, relocation)
    _write_json("insights.json", payload)
    print(f"wrote insights.json with {len(payload['insights'])} insight(s)")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="job-lab", description=__doc__)
    parser.add_argument("--workers", type=int, default=10, help="parallel HTTP workers")
    sub = parser.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build", help="run the full crawl and write static JSON")
    build.add_argument("--redetect", action="store_true", help="re-probe every company's ATS")
    build.add_argument("--dry-run", action="store_true", help="do not write output files")
    build.set_defaults(func=cmd_build)

    detect = sub.add_parser("detect", help="resolve which ATS each company uses")
    detect.add_argument("--redetect", action="store_true", help="ignore the cached map")
    detect.set_defaults(func=cmd_detect)

    health = sub.add_parser("health", help="print the last build report")
    health.set_defaults(func=cmd_health)

    news = sub.add_parser("news", help="refresh industry intelligence JSON")
    news.set_defaults(func=cmd_news)

    trends = sub.add_parser("trends", help="append history and refresh trends JSON")
    trends.set_defaults(func=cmd_trends)

    relocation = sub.add_parser("relocation", help="refresh PPP and visa relocation JSON")
    relocation.set_defaults(func=cmd_relocation)

    insights = sub.add_parser("insights", help="refresh evidence-backed recommendations JSON")
    insights.set_defaults(func=cmd_insights)

    published = sub.add_parser("benchmarks", help="print and export published salary benchmarks")
    published.set_defaults(func=cmd_benchmarks)

    reprice = sub.add_parser("reprice", help="re-read pay from the last crawl without refetching")
    reprice.set_defaults(func=cmd_reprice)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

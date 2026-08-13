"""Company dossiers from free, citeable public sources."""

from __future__ import annotations

import json
import re
import time
from datetime import date
from pathlib import Path
from urllib.parse import quote
from urllib.parse import urlparse

from .net import fetch_json
from .registry import Company

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "data" / "company.json"


def company_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")


def _source(url: str) -> dict:
    return {"source": url, "as_of": date.today().isoformat()}


def _wikidata(companies: list[Company]) -> dict[str, dict]:
    names = sorted({c.name for c in companies if c.name})
    values = " ".join(f'"{name}"@en' for name in names)
    query = f"""
SELECT ?label ?company ?companyLabel ?founded ?employees ?website ?hqLabel ?parentLabel ?industryLabel WHERE {{
  VALUES ?label {{ {values} }}
  ?company rdfs:label ?label.
  OPTIONAL {{ ?company wdt:P571 ?founded. }}
  OPTIONAL {{ ?company wdt:P1128 ?employees. }}
  OPTIONAL {{ ?company wdt:P856 ?website. }}
  OPTIONAL {{ ?company wdt:P159 ?hq. }}
  OPTIONAL {{ ?company wdt:P749 ?parent. }}
  OPTIONAL {{ ?company wdt:P452 ?industry. }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}
"""
    url = "https://query.wikidata.org/sparql?format=json&query=" + quote(query)
    payload, error = fetch_json(url, cache_hours=24 * 30, timeout=30)
    if error or not isinstance(payload, dict):
        return {}
    grouped: dict[str, list[dict]] = {}
    source_url = "https://query.wikidata.org/sparql"
    for row in (payload.get("results") or {}).get("bindings", []) or []:
        label = ((row.get("label") or {}).get("value") or "").lower()
        fields: dict[str, dict] = {}
        if row.get("company"):
            fields["wikidata_id"] = {
                "value": (row["company"]["value"] or "").rsplit("/", 1)[-1],
                **_source(source_url),
            }
        if row.get("founded"):
            fields["founded"] = {"value": row["founded"]["value"][:10], **_source(source_url)}
        if row.get("employees"):
            fields["employee_count"] = {"value": row["employees"]["value"], **_source(source_url)}
        if row.get("website"):
            fields["official_website"] = {"value": row["website"]["value"], **_source(source_url)}
        for src_key, dst_key in (
            ("hqLabel", "headquarters"),
            ("parentLabel", "parent_company"),
            ("industryLabel", "industry"),
        ):
            if row.get(src_key):
                fields[dst_key] = {"value": row[src_key]["value"], **_source(source_url)}
        if fields:
            grouped.setdefault(label, []).append(fields)
    out: dict[str, dict] = {}
    by_name = {c.name.lower(): c for c in companies}
    for label, options in grouped.items():
        company = by_name.get(label)
        domain = (company.domain or "").lower() if company else ""
        root = domain.split(".")[0] if domain else ""
        chosen = None
        for fields in options:
            website = str((fields.get("official_website") or {}).get("value") or "").lower()
            host = urlparse(website).netloc.replace("www.", "")
            if domain and (host == domain or host.endswith("." + domain) or root in host.split(".")):
                chosen = fields
                break
        if chosen:
            out[label] = chosen
    return out


def _github_org(domain: str | None) -> dict | None:
    if not domain:
        return None
    slug = re.sub(r"[^a-z0-9-]+", "", domain.split(".")[0].lower())
    if not slug:
        return None
    payload, error = fetch_json(f"https://api.github.com/orgs/{slug}", cache_hours=24 * 7, timeout=10)
    if error or not isinstance(payload, dict) or not payload.get("login"):
        return None
    return {
        "github_org": {"value": payload["login"], **_source(f"https://api.github.com/orgs/{slug}")},
        "github_public_repos": {
            "value": payload.get("public_repos"),
            **_source(f"https://api.github.com/orgs/{slug}"),
        },
        "github_open_source_signal": {
            "value": bool((payload.get("public_repos") or 0) > 0),
            **_source(f"https://api.github.com/orgs/{slug}"),
        },
    }


def build_company_dossiers(companies: list[Company], *, write: bool = True) -> dict:
    wikidata = _wikidata(companies)
    dossiers = {}
    github_calls = 0
    for company in companies:
        dossier = {"name": company.name, "domain": company.domain, "facts": {}}
        dossier["facts"].update(wikidata.get(company.name.lower()) or {})
        github = None
        # The unauthenticated GitHub limit is 60/hour; stay below it in CI.
        if github_calls < 45 and ("devtools" in company.tags or "remote-first" in company.tags):
            github_calls += 1
            github = _github_org(company.domain)
        if github:
            dossier["facts"].update(github)
        dossiers[company_slug(company.name)] = dossier
        time.sleep(0.05)

    payload = {
        "generated_at": date.today().isoformat(),
        "sources": {
            "wikidata": "https://query.wikidata.org/sparql",
            "github": "https://api.github.com/orgs/{org}",
        },
        "companies": dossiers,
    }
    if write:
        OUT_PATH.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    return payload

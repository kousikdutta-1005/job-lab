"""The relocation page promises visa difficulty is weighted. It has to be.

The copy said a role paying double behind a lottery you will not win is not a
better job, and then ranked strictly by raw PPP-adjusted pay, so the top four
were all H-1B cities. This checks the ordering matches the promise.
"""

from __future__ import annotations

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from joblab.relocation import COMPARABLE_BAND_PCT, VISA_ATTAINABILITY, VISA_LABEL, _shown

PASSES: list[str] = []
FAILURES: list[str] = []


def ok(cond: bool, label: str) -> None:
    (PASSES if cond else FAILURES).append(label)
    print(f"{'.' if cond else 'x'} {label}")


def expected(pct: float, difficulty: str) -> float:
    """The same rule build() applies, restated so the test is independent."""
    p = VISA_ATTAINABILITY[difficulty]
    return round(pct * p if pct > 0 else pct, 1)


def main() -> int:
    # --- the rule itself
    ok(expected(67, "very_high") < expected(30, "medium"),
       "a 30% gain you can get beats a 67% gain behind a lottery")
    ok(expected(67, "very_high") > 0,
       "but a long shot at a big gain still beats standing still")
    ok(expected(-36, "very_high") == -36,
       "a pay cut is not discounted by the visa odds")
    ok(expected(-36, "very_high") < expected(0, "home"),
       "a bad move you probably cannot make never outranks staying put")
    ok(VISA_ATTAINABILITY["home"] == 1.0, "home is never discounted")
    ok(all(0 < v <= 1 for v in VISA_ATTAINABILITY.values()),
       "every attainability factor is a probability")
    ok(VISA_ATTAINABILITY["very_high"] < VISA_ATTAINABILITY["high"] < VISA_ATTAINABILITY["medium"],
       "harder visas are discounted harder")

    # --- prose and pill must round identically
    ok(_shown(66.5) == 67, "66.5 shows as 67, the way JavaScript will render it")
    ok(_shown(-11.8) == 12, "the shown value is the magnitude, sign lives in the words")
    ok(f"{66.5:.0f}" == "66" and _shown(66.5) == 67,
       "and the naive Python format is the bug this replaces")

    # --- no raw enum keys in prose
    ok("_" not in VISA_LABEL["very_high"], "very_high is spoken as 'very high'")
    ok(all("_" not in v for v in VISA_LABEL.values()), "no visa label leaks an underscore")

    # --- the generated file agrees
    path = pathlib.Path(__file__).resolve().parent.parent / "web/public/data/relocation.json"
    if path.exists():
        data = json.loads(path.read_text())
        cities = data["cities"]
        ok(data.get("comparable_band_pct") == COMPARABLE_BAND_PCT,
           "the band the pill colours by is published, not hardcoded twice")

        ranked = [c for c in cities if c["expected_uplift_pct"] is not None]
        ok(ranked == sorted(ranked, key=lambda c: -c["expected_uplift_pct"]),
           "the file is ordered by the discounted number")

        ok(all("_" not in (c.get("visa_difficulty_label") or "") for c in cities),
           "no city row carries an unspoken enum label")

        for c in ranked:
            raw = c["ppp_adjusted_vs_bengaluru_pct"]
            if raw > 0 and c["visa_difficulty"] != "home":
                ok(c["expected_uplift_pct"] < raw,
                   f"{c['city']}: {raw}% is discounted to {c['expected_uplift_pct']}%")
                break

        # Inside the band means the estimate cannot tell the cities apart, and
        # that is true whatever the visa costs. The visa branch used to sit in
        # front of this test and swallow it, so Dallas read "Looks 10% better on
        # real pay" beside a neutral pill that meant the opposite.
        strays = [
            c["city"]
            for c in ranked
            if c["ppp_adjusted_vs_bengaluru_pct"] is not None
            and abs(c["ppp_adjusted_vs_bengaluru_pct"]) <= COMPARABLE_BAND_PCT
            and "roughly comparable" not in c["verdict"]
        ]
        ok(not strays, f"everything inside the band is called roughly comparable ({strays})")

        boasts = [
            c["city"]
            for c in ranked
            if c["ppp_adjusted_vs_bengaluru_pct"] is not None
            and abs(c["ppp_adjusted_vs_bengaluru_pct"]) <= COMPARABLE_BAND_PCT
            and ("% better" in c["verdict"] or "% above" in c["verdict"] or "% below" in c["verdict"])
        ]
        ok(not boasts, f"and none of them claims a direction anyway ({boasts})")

        # The visa caveat must survive the reorder rather than be replaced by it.
        hard = [c for c in ranked if c.get("visa_difficulty") in {"high", "very_high"}]
        ok(bool(hard), "the fixture contains a hard-visa city")
        ok(
            all("long shot" in c["verdict"] for c in hard),
            "every hard-visa city still says it is a long shot",
        )
        inside_hard = [
            c
            for c in hard
            if c["ppp_adjusted_vs_bengaluru_pct"] is not None
            and abs(c["ppp_adjusted_vs_bengaluru_pct"]) <= COMPARABLE_BAND_PCT
        ]
        ok(
            all(
                "roughly comparable" in c["verdict"] and "long shot" in c["verdict"]
                for c in inside_hard
            ),
            "a hard-visa city inside the band states both facts, not one of them",
        )
        outside = [
            c
            for c in ranked
            if c["ppp_adjusted_vs_bengaluru_pct"] is not None
            and abs(c["ppp_adjusted_vs_bengaluru_pct"]) > COMPARABLE_BAND_PCT
        ]
        ok(
            all("roughly comparable" not in c["verdict"] for c in outside),
            "and a city outside the band is never called comparable",
        )

        # Every city must be able to say where its median came from. The row
        # prints the median beside an open-role count, which reads as "the
        # median of those roles" -- true for Seattle, where six postings
        # disclosed a band, and false for Dallas, which had one open role, zero
        # disclosed bands, and a median taken from the published benchmark.
        ok(
            all(c.get("pay_basis", {}).get("kind") for c in ranked),
            "every city states the basis of its median",
        )
        mismatched = [
            c["city"]
            for c in ranked
            if c["pay_basis"].get("kind") == "crawled_disclosed_bands"
            and not c["pay_basis"].get("samples")
        ]
        ok(
            not mismatched,
            f"no city claims crawled bands without samples ({mismatched})",
        )
        benchmarked = [c for c in ranked if c["pay_basis"].get("kind") == "published_benchmark"]
        ok(
            all(not c["pay_basis"].get("samples") for c in benchmarked),
            "and a benchmark-based median never reports crawled samples",
        )

        # The tax figure is a country rate shown on a city row. Seattle, Dallas
        # and Palo Alto sit in three different state regimes and all read 32%,
        # so the caveat the data already carries has to travel with it.
        taxed = [c for c in ranked if c.get("effective_tax_rate") is not None]
        ok(bool(taxed), "at least one city carries a tax rate")
        ok(
            all(c.get("tax_note") for c in taxed),
            "every city with a tax rate also carries its caveat",
        )
        us = [c for c in taxed if c.get("country") == "US"]
        if us:
            ok(
                len({c["effective_tax_rate"] for c in us}) == 1,
                "the US rate really is one country-wide number, not a per-city one",
            )
            ok(
                all("vary" in (c.get("tax_note") or "") for c in us),
                "and the US note says the underlying rates vary",
            )

    print()
    if FAILURES:
        print(f"FAIL — {len(FAILURES)} of {len(PASSES) + len(FAILURES)}")
        for f in FAILURES:
            print(f"   x {f}")
        return 1
    print(f"PASS — {len(PASSES)} assertions on relocation ranking")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

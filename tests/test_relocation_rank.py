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

        verdicts_ok = True
        for c in ranked:
            raw = c["ppp_adjusted_vs_bengaluru_pct"]
            if abs(raw) <= COMPARABLE_BAND_PCT and c["visa_difficulty"] == "home":
                if "roughly comparable" not in c["verdict"]:
                    verdicts_ok = False
        ok(verdicts_ok, "everything inside the band is called roughly comparable")

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

"""The board must not fill up with hardware engineers who happen to design things.

"Design Engineer" is the standard title for someone who designs parts in
mechanical, electrical and defence engineering. The blocklist chasing that
ambiguity grew to forty patterns and still let eleven through, including three
warhead engineers, whose pay bands sat at the top of the salary table.
"""

from __future__ import annotations

import sys

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))

from joblab.config import is_design_role, product_design_evidence

PASSES: list[str] = []
FAILURES: list[str] = []


def ok(cond: bool, label: str) -> None:
    (PASSES if cond else FAILURES).append(label)
    print(f"{'.' if cond else 'x'} {label}")


SOFTWARE_JD = (
    "You will build interfaces in React and TypeScript, own our design system, "
    "and work in Figma with product designers. Strong CSS and accessibility "
    "skills required. You will prototype quickly and ship responsive web apps."
)
HARDWARE_JD = (
    "Design and analyse warhead structures for lethality. Own mechanical "
    "packaging, run FEA, and work with manufacturing partners on tolerance "
    "analysis. Experience with explosive trains and fuzing preferred."
)
THIN_JD = "Join our fast-growing team. Competitive salary and benefits."


def main() -> int:
    # --- the roles that broke it
    ok(not is_design_role("Senior Warhead Design Engineer - Lethality Team", HARDWARE_JD),
       "a warhead design engineer is not a design role")
    ok(not is_design_role("Senior Wire Harness Design Engineer", HARDWARE_JD),
       "a wire harness design engineer is not a design role")
    ok(not is_design_role("Analog Design Engineer", HARDWARE_JD),
       "an analog design engineer is not a design role")
    ok(not is_design_role("Senior Structures Design Engineer, Omen", HARDWARE_JD),
       "a structures design engineer is not a design role")
    ok(not is_design_role("Senior EMC Design Engineer, Air Dominance and Strike", HARDWARE_JD),
       "an EMC design engineer is not a design role")
    ok(not is_design_role("AI Infrastructure DC Design Engineer II", THIN_JD),
       "a datacentre design engineer is not a design role")
    ok(not is_design_role("Interposer Design Engineer", HARDWARE_JD),
       "an interposer design engineer is not a design role")
    ok(not is_design_role("Physical Design Engineer", HARDWARE_JD),
       "a physical design engineer is not a design role")
    ok(not is_design_role("Overhead Line (OHL) Design engineer", HARDWARE_JD),
       "an overhead line design engineer is not a design role")
    ok(not is_design_role("Senior Staff Digital Design Engineer", HARDWARE_JD),
       "a digital design engineer is chip work, not screen work")
    ok(not is_design_role("System Design Engineer", HARDWARE_JD),
       "a system design engineer needs corroboration and a hardware JD gives none")

    # --- the roles that must survive, which is the harder half
    ok(is_design_role("Design Engineer, Presence", SOFTWARE_JD),
       "a software design engineer is kept when the posting proves it")
    ok(is_design_role("Senior Design Engineer", SOFTWARE_JD),
       "a bare senior design engineer is kept on description evidence")
    ok(is_design_role("Design Engineer, Growth & Marketing", THIN_JD),
       "a growth-and-marketing design engineer is kept on the title alone")
    ok(is_design_role("Staff / Principal Design Engineer, Web", THIN_JD),
       "a web design engineer is kept on the title alone")
    ok(is_design_role("Senior or Staff Design Engineer, Design Systems", THIN_JD),
       "a design systems engineer is kept on the title alone")
    ok(is_design_role("UX Engineer", THIN_JD),
       "a UX engineer never needed corroborating")

    # --- the ordinary titles must be untouched by all of this
    ok(is_design_role("Senior Product Designer", None),
       "a product designer is kept with no description at all")
    ok(is_design_role("Head of Design", None), "head of design is kept")
    ok(is_design_role("Staff Designer", None), "a bare staff designer is kept")
    ok(not is_design_role("Mechanical Design Engineer", SOFTWARE_JD),
       "a hard exclude still wins over description evidence")
    ok(not is_design_role("Design Recruiter", None), "a design recruiter is not a design role")
    ok(not is_design_role("Senior Backend Engineer", SOFTWARE_JD),
       "a backend engineer is not admitted by a design-heavy JD")

    # --- the evidence counter itself
    ok(product_design_evidence(None) == 0, "no description scores zero")
    ok(product_design_evidence("figma figma figma figma") == 1,
       "one term repeated cannot corroborate itself")
    ok(product_design_evidence(SOFTWARE_JD) >= 3, "a real design JD clears the bar")
    ok(product_design_evidence(HARDWARE_JD) < 3, "a warhead JD does not clear the bar")

    # --- the point of the rule: it works without the blocklist
    # The blocklist grew by chasing disciplines after they appeared. This
    # gutting keeps the corroboration rule and removes every hardware word,
    # then asks it about three disciplines nobody has ever added a pattern for.
    import re

    import joblab.config as C

    original = C._EXCLUDE_RE
    hardware_words = {
        "warhead", "ordnance", "lethality", "wire harness", "avionic(s)?", "propulsion",
        "aerodynamic(s)?", "structures", "emc", "analog", "interposer", "silicon", "verilog",
        "overhead line", "ohl", "physical design", "digital design engineer", "actuator",
        "electromagnetic", "robotic(s)?", "hardware", "thermal", "gear", "motor", "battery",
        "optical", "antenna", "asic", "fpga", "embedded", "semiconductor", "vlsi", "rtl",
        "chip", "mechanical", "electrical", "circuit", "pcb", "cad", "structural",
    }
    C._EXCLUDE_RE = [
        re.compile(p, re.I)
        for p in C.EXCLUDE_TITLE_PATTERNS
        if not any(p == rf"\b{w}\b" for w in hardware_words)
    ]
    try:
        unseen = [
            "Cryogenic Valve Design Engineer",
            "Nuclear Shielding Design Engineer",
            "Hydraulic Design Engineer",
        ]
        ok(not any(is_design_role(t, HARDWARE_JD) for t in unseen),
           "disciplines the blocklist has never heard of are still rejected")
        ok(not is_design_role("Senior Warhead Design Engineer", HARDWARE_JD),
           "the known hardware roles stay rejected with the blocklist gutted")
        ok(is_design_role("Design Engineer, Presence", SOFTWARE_JD),
           "and the real ones survive the gutting too")
    finally:
        C._EXCLUDE_RE = original

    print()
    if FAILURES:
        print(f"FAIL — {len(FAILURES)} of {len(PASSES) + len(FAILURES)}")
        for f in FAILURES:
            print(f"   x {f}")
        return 1
    print(f"PASS — {len(PASSES)} assertions on the role filter")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

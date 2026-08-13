"""An email draft may not claim something the resume cannot support.

The drafts picked their talking points with `hooks()`, which ranks the
posting's keywords by rarity. That is the right answer for "the parts about X
are what made me write" — a statement about the job. It was also being used
for "strongest on X" and "the overlap is closest on X", which are statements
about the person, and nothing checked whether the person could back them up.

Observed on a live posting: the Resume tab listed "definition" and "iteration"
under Genuinely missing, and the referral draft on the very next tab read
"5 years in product design, strongest on definition and iteration".

Also covers the DNS half of the same principle: a lookup that never completed
is not evidence that a domain refuses mail.
"""

import sys

sys.path.insert(0, ".")

from joblab import contacts  # noqa: E402

passed = 0
failed = 0


def ok(cond, label):
    global passed, failed
    if cond:
        passed += 1
        print(f". {label}")
    else:
        failed += 1
        print(f"x {label}")


# --- the domain half -------------------------------------------------------

checked_no_mx = {"accepts_mail": False, "provider": None, "checked": True}
never_checked = {"accepts_mail": False, "provider": None, "checked": False}
has_mail = {"accepts_mail": True, "provider": "Google Workspace", "checked": True}


def result(mail, evidence=()):
    """Pin the DNS answer so the assertion is about the branch, not the network."""
    contacts.mail_setup = lambda domain: dict(mail)
    return contacts.email_guesses("example.com", evidence_texts=list(evidence))


a = result(checked_no_mx)
ok(a["confidence"] == "unusable", "a domain checked with no MX is unusable")
ok("no mail records" in a["note"], "and says so plainly")

b = result(never_checked)
ok(b["confidence"] != "unusable", f"a failed lookup is not unusable (got {b['confidence']})")
ok(
    "no mail records" not in b["note"],
    "a failed lookup never claims the domain has no mail records",
)
ok(
    "did not complete" in b["note"],
    "it says the check did not complete, which is the thing that is actually true",
)
ok(len(b["patterns"]) > 0, "and it still offers patterns instead of giving up")

c = result(has_mail)
ok(c["confidence"] == "guess", "a live domain with no published address is a guess")
ok("Google Workspace" in c["note"], "and names the provider it found")

# Negative control: collapsing the two states back together reintroduces the
# fabricated negative.
ok(
    result(never_checked)["note"] != result(checked_no_mx)["note"],
    "negative control — the two states must not produce the same sentence",
)

print(
    f"\nPASS — {passed} assertions on claim evidence"
    if failed == 0
    else f"\nFAIL — {failed} of {passed + failed}"
)
sys.exit(1 if failed else 0)

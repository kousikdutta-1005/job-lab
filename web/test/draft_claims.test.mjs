/**
 * An outreach draft may not put a claim in your mouth that your resume cannot
 * support.
 *
 * `hooks()` ranks what the posting asks for, which is the right input for "the
 * parts about X are what made me write" — a statement about the job. The
 * drafts also used it for "strongest on X", which is a statement about you.
 * On a live Hackerrank posting that produced an email reading "5 years in
 * product design, strongest on definition and iteration" while the resume
 * panel one tab away listed definition and iteration as the biggest gaps.
 */
import { claimable, drafts, hooks, linkedinDrafts } from "../src/lib/email.ts"

let passed = 0
let failed = 0
const ok = (cond, m) => {
  if (cond) {
    passed++
    console.log(`. ${m}`)
  } else {
    failed++
    console.log(`x ${m}`)
  }
}

const JOB = {
  id: "j1",
  title: "Senior Product Designer",
  company: "Hackerrank",
  url: "https://example.com/j1",
  location: "Bangalore, India",
  india: true,
  keywords: ["definition", "iteration", "figma", "design systems", "kubernetes"],
  keyword_groups: { craft: ["figma", "design systems"], other: ["definition", "iteration"] },
}
// Rare-but-unbacked terms outrank the ones actually evidenced, which is what
// made the original bug reachable.
const IDF = {
  definition: 3.1,
  iteration: 3.0,
  kubernetes: 2.9,
  figma: 1.2,
  "design systems": 1.4,
}

const ME = {
  full_name: "Kousik Dutta",
  portfolio: "https://kousikdutta.com",
  years: 5,
  resume_text: "Senior Product Designer. Built design systems in Figma for fintech.",
}
const STRENGTHS = ["figma", "design systems", "prototyping"]

// --- claimable ------------------------------------------------------------

ok(
  hooks(JOB, IDF, 2).join() === "definition,iteration",
  "hooks still returns the rarest posting terms, unchanged",
)

const proven = claimable(JOB, IDF, ME.resume_text, STRENGTHS, 3)
ok(!proven.includes("definition"), "claimable drops a term the resume never says")
ok(!proven.includes("kubernetes"), "claimable drops a rare term with no evidence anywhere")
ok(proven.includes("figma"), "claimable keeps a term the resume actually contains")
ok(proven.includes("design systems"), "claimable keeps a multi-word term found in the resume")

const profileOnly = claimable(JOB, IDF, "", ["design systems"], 3)
ok(
  profileOnly.join() === "design systems",
  `the profile alone can support a claim (${profileOnly.join()})`,
)
ok(claimable(JOB, IDF, "", [], 3).length === 0, "no resume and no profile means no claims at all")

// --- the drafts themselves ------------------------------------------------

const built = drafts(JOB, ME, IDF, "Priya", STRENGTHS)
const bodies = built.map((d) => d.body).join("\n")

ok(
  /strongest on design systems|strongest on figma/.test(bodies),
  "the referral draft claims something the resume supports",
)
ok(
  !/strongest on definition|strongest on iteration/.test(bodies),
  "no draft claims strength in a term the resume lacks",
)
ok(
  /parts about definition and iteration/.test(bodies),
  "what drew you to the role may still name the posting's own words",
)

// With nothing to stand on, the sentence must disappear rather than invent.
const bare = drafts(JOB, { ...ME, resume_text: "" }, IDF, "Priya", [])
const bareBodies = bare.map((d) => d.body).join("\n")
ok(!/strongest on/.test(bareBodies), "with no evidence the strength claim is dropped, not faked")
ok(
  !/,\s*\.|\s\s+\./.test(bareBodies),
  "dropping the clause leaves no dangling comma or double space",
)
ok(
  /5 years in product design\./.test(bareBodies),
  "the surrounding sentence still reads correctly without it",
)

// --- LinkedIn notes -------------------------------------------------------

const li = linkedinDrafts(JOB, ME, IDF, "Priya Sharma", "Head of Design", STRENGTHS)
const liBodies = li.map((d) => d.body).join("\n")
ok(!/mostly definition|mostly iteration/.test(liBodies), "a connection note claims no unbacked term")
ok(
  /mostly design systems|mostly figma/.test(liBodies),
  "a connection note may claim an evidenced one",
)
ok(
  li.every((d) => !d.limit || d.body.length <= d.limit),
  "every note still fits LinkedIn's character limit after the edit",
)

const liBare = linkedinDrafts(JOB, { ...ME, resume_text: "" }, IDF, "Priya", "Recruiter", [])
ok(
  !/mostly /.test(liBare.map((d) => d.body).join("\n")),
  "with no evidence the note drops the claim entirely",
)

// The resume is the attachment. A term it contains must outrank a profile-only
// claim, however rare the profile term is, or the email leads with something
// the reader's copy of your resume never mentions.
const tiered = claimable(
  { ...JOB, keywords: ["figma", "enterprise"] },
  { figma: 1.1, enterprise: 3.9 },
  "Built design systems in Figma.",
  ["enterprise", "figma"],
  2,
)
ok(tiered[0] === "figma", `a resume-backed term outranks a rarer profile-only one (${tiered[0]})`)
ok(tiered.includes("enterprise"), "the profile-only term is still available, just second")

const profileFallback = claimable(
  { ...JOB, keywords: ["enterprise"] },
  { enterprise: 3.9 },
  "Built design systems in Figma.",
  ["enterprise"],
  2,
)
ok(
  profileFallback.join() === "enterprise",
  "when the resume backs nothing, a profile claim is still allowed",
)

// --- An empty slot must take its clause with it ---------------------------
// "my portfolio" as a fallback URL produced "My portfolio is the shortest
// version of that: my portfolio" — finished-looking prose that says nothing,
// in the one artefact the user actually sends to a stranger.

const BLANK = { years: 5, resume_text: ME.resume_text }
const blankDrafts = drafts(JOB, BLANK, IDF, "there", STRENGTHS)
const blankBodies = blankDrafts.map((d) => d.body).join("\n")
const blankSubjects = blankDrafts.map((d) => d.subject).join("\n")
const blankLi = linkedinDrafts(JOB, BLANK, IDF, "Priya", "Head of Design", STRENGTHS)
  .map((d) => d.body)
  .join("\n")

ok(!/my portfolio\b/i.test(blankBodies), "no email says the words 'my portfolio' in a URL slot")
ok(!/my profile\b/i.test(blankLi), "no LinkedIn note says 'my profile' in a URL slot")
ok(
  !/shortest version of that:\s*$|shortest version of that:\s*\n/m.test(blankBodies),
  "the portfolio sentence is removed, not left dangling after its colon",
)
for (const [label, re] of [
  ["here:", /(is here|Everything's here):\s*(\n|$|\.)/m],
  ["case studies:", /case studies:\s*(\n|$|\.)/m],
  ["work at", /Work is at\s*(\.|\n|$)/m],
]) {
  ok(!re.test(blankBodies + blankLi), `no clause is left pointing at nothing (${label})`)
}
ok(!/\s+\./.test(blankBodies), "removing a clause leaves no space before a full stop")
ok(!/ {2}/.test(blankBodies), "and no doubled spaces")
ok(
  !blankSubjects.split("\n").some((x) => /—\s*portfolio$/.test(x)),
  "a missing name never becomes the subject line's signatory",
)
ok(
  blankDrafts[0].subject === JOB.title,
  `an unnamed sender gets a plain role subject (${blankDrafts[0].subject})`,
)
ok(
  blankBodies.includes("unglamorous half of design"),
  "the surrounding paragraph survives intact",
)
ok(
  blankLi.split("\n").every((l) => l.length <= 300),
  "the LinkedIn notes still respect the 300-character limit",
)

// The filled case must be unaffected.
const fullBodies = drafts(JOB, ME, IDF, "there", STRENGTHS).map((d) => d.body).join("\n")
ok(
  fullBodies.includes(`shortest version of that: ${ME.portfolio}`),
  "with a portfolio set, the sentence is present and carries the URL",
)
ok(
  (fullBodies.match(new RegExp(ME.portfolio.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length >= 3,
  "and every draft that offers work still links it",
)
ok(
  linkedinDrafts(JOB, ME, IDF, "Priya", "Head of Design", STRENGTHS)[0].body.includes(ME.portfolio),
  "the connection note links it too",
)
ok(
  drafts(JOB, ME, IDF, "there", STRENGTHS)[0].subject === `${JOB.title} — ${ME.full_name}`,
  "and a named sender still signs the subject",
)

// Portfolio present but name missing, and the reverse.
const noName = drafts(JOB, { ...ME, full_name: "" }, IDF, "there", STRENGTHS)
ok(noName[0].body.includes(ME.portfolio), "a missing name does not remove the portfolio sentence")
const noLink = drafts(JOB, { ...ME, portfolio: "" }, IDF, "there", STRENGTHS)
ok(
  noLink[0].subject === `${JOB.title} — ${ME.full_name}`,
  "a missing portfolio does not remove the name from the subject",
)

console.log(
  failed === 0
    ? `\nPASS — ${passed} assertions on draft claims`
    : `\nFAIL — ${failed} of ${passed + failed}`,
)
process.exit(failed ? 1 : 0)

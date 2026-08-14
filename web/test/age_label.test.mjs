/**
 * A row's age and the card beneath it have to be the same number.
 *
 * postedLabel promised exactly that in its own docstring — "read from
 * quality.days_open, the same source the colour and the vetting card use, so a
 * row cannot show one figure while the card below it shows another" — and then
 * only honoured it in the warn and bad branches. Fresh and neutral rows fell
 * back to ago(job.posted_at), a different source.
 *
 * It agreed by accident. days_open is max(employer's posted date, our first
 * sighting), and while local history is younger than the postings, the employer
 * date always wins and the two numbers coincide. As soon as history outlives a
 * repost — our history says sixty days, the reset posting says three — a row
 * reads "3d ago" above a card reading "Open 60 days".
 */
import { postedLabel, ageTone } from "../src/lib/vetting.ts"

let passed = 0
let failed = 0
const ok = (cond, m) => {
  if (cond) { passed++; console.log(`. ${m}`) }
  else { failed++; console.log(`x ${m}`) }
}

const iso = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10)
const job = (days_open, postedDaysAgo, basis = "first_seen_in_history") => ({
  id: "j",
  title: "Senior Product Designer",
  company: "Acme",
  posted_at: postedDaysAgo == null ? null : iso(postedDaysAgo),
  quality: {
    days_open,
    days_open_basis: basis,
    description_specificity: 0.7,
    repost_count: null,
    always_open: null,
  },
})

// --- The repost: the two sources disagree ---------------------------------
const repost = job(60, 3)
ok(postedLabel(repost) === "60d open", `a repost shows the age we observed, not the reset date (${postedLabel(repost)})`)
ok(ageTone(repost) === "warn", "and is still coloured by that same number")

const youngRepost = job(20, 2)
ok(postedLabel(youngRepost) === "20d ago", `a repost inside the neutral band still shows 20 days (${postedLabel(youngRepost)})`)
ok(ageTone(youngRepost) === "neutral", "and stays neutral, because the colour never switched source")

const freshRepost = job(5, 1)
ok(postedLabel(freshRepost) === "5d ago", `even a fresh-looking repost reports the observed age (${postedLabel(freshRepost)})`)

// --- Two rows of identical age must print identical figures ----------------
for (const d of [0, 1, 6, 7, 8, 29, 30, 31, 52, 89, 90, 91, 120, 400]) {
  const a = postedLabel(job(d, d))
  const b = postedLabel(job(d, 1))
  ok(a === b, `${d} days reads the same whatever the posting claims (${a} / ${b})`)
}

// --- The vocabulary still turns over at the same place the tone does -------
for (const d of [0, 1, 7, 15, 30]) {
  const tone = ageTone(job(d, d))
  ok(
    /today|d ago$/.test(postedLabel(job(d, d))) && (tone === "good" || tone === "neutral"),
    `${d} days is written as a posting date and toned ${tone}`,
  )
}
for (const d of [31, 52, 90, 91, 200]) {
  const tone = ageTone(job(d, d))
  ok(
    /open$/.test(postedLabel(job(d, d))) && (tone === "warn" || tone === "bad"),
    `${d} days is written as time open and toned ${tone}`,
  )
}

ok(postedLabel(job(0, 0)) === "today", "zero days is a word, not '0d ago'")
ok(postedLabel(job(91, 91)) === "3mo open", `past ninety days rounds to months (${postedLabel(job(91, 91))})`)
ok(postedLabel(job(90, 90)) === "90d open", "ninety itself is still exact, matching the vetting card's boundary")

// --- No days_open at all: fall back, but only then ------------------------
const unknown = { id: "j", title: "t", company: "c", posted_at: iso(4), quality: null }
ok(/4/.test(postedLabel(unknown)), `with no measured age the posted date is all there is (${postedLabel(unknown)})`)
const nothing = { id: "j", title: "t", company: "c", posted_at: null, quality: null }
ok(typeof postedLabel(nothing) === "string", "and a missing date does not throw")

console.log(
  failed === 0
    ? `\nPASS — ${passed} assertions on the age label`
    : `\nFAIL — ${failed} of ${passed + failed}`,
)
process.exit(failed ? 1 : 0)

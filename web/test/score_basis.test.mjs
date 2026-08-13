/**
 * The board score and the resume score are two different measurements, and the
 * app said they were one.
 *
 * match_score is computed in Python from data/profile.yaml — level, years,
 * location, target titles, strengths. The resume never touches it. Three
 * surfaces nonetheless told the user "every role on the board is scored against
 * your resume", while the board sat there showing 94, 93, 89 with no resume
 * loaded. Either the sentence was wrong or every one of those numbers was
 * unearned, and the sentence was wrong.
 *
 * This guards the invariant, not just the wording: if the board score ever does
 * start depending on the resume, the first assertion here fails and the copy has
 * to be revisited deliberately.
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const ok = (cond, m) => {
  if (cond) { passed++; console.log(`. ${m}`) }
  else { failed++; console.log(`x ${m}`) }
}

const root = new URL("..", import.meta.url).pathname
const jobs = JSON.parse(readFileSync(join(root, "public/data/jobs.json"), "utf8"))
const rows = Array.isArray(jobs) ? jobs : jobs.jobs

// --- The invariant the copy now rests on ----------------------------------
ok(rows.length > 0, `the board has jobs to check (${rows.length})`)
ok(
  rows.every((j) => typeof j.match_score === "number"),
  "every role carries a board score, with or without a resume",
)
const resumeWords = /\bresume\b|\bcv\b|\bats\b/i
const leaked = rows.filter((j) => (j.match_reasons || []).some((r) => resumeWords.test(r)))
ok(!leaked.length, `no board score explains itself with the resume (${leaked.length} leaks)`)
for (const j of leaked.slice(0, 3)) console.log(`     ${j.company}: ${j.match_reasons.join(" / ")}`)

const profileWords = /level|year|india|remote|title|strength|overlap|match|pay|band|posted|open|team|role|location|onsite|hybrid|senior|lead|staff|manager|head|mid|design|city|visa|relocat/i
const unexplained = rows.filter((j) =>
  (j.match_reasons || []).some((r) => !profileWords.test(r)),
)
ok(
  unexplained.length === 0,
  `every reason names a profile fact (${unexplained.length} do not)`,
)
for (const j of unexplained.slice(0, 3)) console.log(`     ${j.company}: ${j.match_reasons.join(" / ")}`)

// --- The copy must not re-merge the two scores -----------------------------
function sources(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...sources(full))
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full)
  }
  return out
}
const files = sources(join(root, "src"))
ok(files.length > 5, `found the source tree (${files.length} files)`)

// The exact shape of the old claim: the board, scored, against the resume.
const claim = /(every (role|job)[^.]{0,40}on the board[^.]{0,60}scored against it|on the board (is|are|gets|get) then scored against it)/i
const offenders = files.filter((f) => claim.test(readFileSync(f, "utf8").replace(/\s+/g, " ")))
ok(!offenders.length, `no surface says the board is scored against the resume (${offenders.length})`)
for (const f of offenders) console.log(`     ${f.replace(root, "")}`)

// And the surfaces that talk about the resume must say where its score lands.
const resumeCopy = files.filter((f) => /Paste (your|the plain text of your) resume/i.test(readFileSync(f, "utf8")))
ok(resumeCopy.length >= 2, `the resume is explained in more than one place (${resumeCopy.length})`)
for (const f of resumeCopy) {
  const text = readFileSync(f, "utf8").replace(/\s+/g, " ")
  ok(/ATS match/i.test(text), `${f.split("/").pop()} names what the resume actually produces`)
}

// The board score's own panel says what it is measured against.
const detail = readFileSync(join(root, "src/components/JobDetail.tsx"), "utf8")
ok(
  /Why this ranks \{job\.match_score\} against your profile/.test(detail),
  "the ranking panel names the profile as its basis",
)

console.log(
  failed === 0
    ? `\nPASS — ${passed} assertions on what each score measures`
    : `\nFAIL — ${failed} of ${passed + failed}`,
)
process.exit(failed ? 1 : 0)

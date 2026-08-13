// "Within 5% of each other" is not transitive.
//
// The pay chart sorts levels by median, and a sorted bar chart reads as a
// ladder whether or not the numbers differ. Naming the ties is the honest fix.
// The first attempt tested each level against its neighbours and printed every
// survivor as one list, which claimed Manager (2.26 Cr) and Senior (1.60 Cr)
// were within 5% of each other. They are 41% apart. Adjacency chains; the
// relation the sentence asserts does not.

import { tiedLevels, listPhrase } from "../src/lib/negotiate.ts"

let bad = 0
const pass = (m) => console.log(`  . ${m}`)
const fail = (m) => {
  bad++
  console.log(`  x ${m}`)
}
const check = (c, ok, no) => (c ? pass(ok) : fail(no))

const band = (median) => ({ median })
// The live corpus, in the order the chart draws it.
const LIVE = [
  ["Manager", band(2.26)],
  ["Principal", band(2.22)],
  ["Director", band(2.09)],
  ["Staff", band(2.02)],
  ["Mid-level", band(1.66)],
  ["Lead", band(1.62)],
  ["Senior", band(1.6)],
]

const runs = tiedLevels(LIVE)

check(runs.length === 3, "the live board yields three separate clusters", `got ${runs.length}: ${JSON.stringify(runs)}`)

const flat = runs.map((r) => r.join("+"))
check(flat.includes("Manager+Principal"), "Manager and Principal tie", `missing: ${flat}`)
check(flat.includes("Director+Staff"), "Director and Staff tie", `missing: ${flat}`)
check(flat.includes("Mid-level+Lead+Senior"), "Mid-level, Lead and Senior tie", `missing: ${flat}`)

// The bug, stated directly.
const together = runs.find((r) => r.includes("Manager") && r.includes("Senior"))
check(!together, "Manager and Senior are never placed in one cluster", "the 41% gap was called a tie")

const sentence = runs.map(listPhrase).join("; ")
check(
  !/Manager[^;]*Senior/.test(sentence),
  "and no single clause names both of them",
  `clause chained across clusters: ${sentence}`,
)
check(
  sentence === "Manager and Principal; Director and Staff; Mid-level, Lead and Senior",
  "the rendered sentence reads as three clauses",
  `got: ${sentence}`,
)

// --- the relation itself ----------------------------------------------------

check(tiedLevels([]).length === 0, "no levels yields no claim", "invented a cluster from nothing")
check(tiedLevels([["A", band(10)]]).length === 0, "a single level ties with nothing", "one level formed a cluster")
check(
  tiedLevels([
    ["A", band(10)],
    ["B", band(5)],
  ]).length === 0,
  "two distant levels are not reported as tied",
  "a 50% gap was called a tie",
)
check(
  tiedLevels([
    ["A", band(10)],
    ["B", band(9.8)],
  ])[0]?.length === 2,
  "two close levels are reported",
  "a 2% gap was not called a tie",
)

// A stepladder where every step is small but the ends are far apart. This is
// the shape that broke the first version.
const creep = [
  ["A", band(100)],
  ["B", band(97)],
  ["C", band(94.1)],
  ["D", band(91.3)],
]
const crept = tiedLevels(creep)
check(crept.length === 1 && crept[0].length === 4, "a genuine chain of small steps is one run", `got ${JSON.stringify(crept)}`)
check(
  Math.abs(100 - 91.3) / 100 > 0.05,
  "regression note: that run's endpoints are themselves >5% apart",
  "fixture no longer demonstrates the creep case",
)

// Every member of a reported run must be adjacent to the next one within
// tolerance -- the property the sentence is entitled to assert.
for (const run of [...runs, ...crept]) {
  const idx = (name) => [...LIVE, ...creep].find(([l]) => l === name)[1].median
  let ok = true
  for (let i = 1; i < run.length; i++) {
    const a = idx(run[i - 1])
    const b = idx(run[i])
    if (Math.abs(a - b) / Math.max(a, b) >= 0.05) ok = false
  }
  check(ok, `every consecutive pair in [${run.join(", ")}] is genuinely within 5%`, `[${run.join(", ")}] contains a gap over 5%`)
}

// --- the phrase -------------------------------------------------------------

check(listPhrase([]) === "", "an empty list renders as nothing", "empty list produced text")
check(listPhrase(["A"]) === "A", "one item renders bare", `got ${listPhrase(["A"])}`)
check(listPhrase(["A", "B"]) === "A and B", "two items join with 'and'", `got ${listPhrase(["A", "B"])}`)
check(listPhrase(["A", "B", "C"]) === "A, B and C", "three items use a comma then 'and'", `got ${listPhrase(["A", "B", "C"])}`)

console.log()
if (bad) {
  console.log(`FAIL — ${bad} problem(s)`)
  process.exit(1)
}
console.log("PASS — ties are clustered, not chained")

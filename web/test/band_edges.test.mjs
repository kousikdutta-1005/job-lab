/**
 * Outside the band is not the edge of the band.
 *
 * percentileIn clamps to 0 and 100. Every caller then read that number, so an
 * offer below the published minimum was described as "near the floor" — merely
 * low, rather than the level problem it usually signals — and an offer above
 * the maximum was described as "near the top of the published band" when it
 * was not inside the band at all. Observed live: ₹36.0 L against a senior
 * Bengaluru band of ₹12.0 L–₹35.0 L reported as "roughly the 100th percentile,
 * near the top of the published band".
 */
import { readOffer } from "../src/lib/negotiate.ts"

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

const BANDS = [
  {
      city: "Bengaluru",
      seniority: "senior",
      low_inr: 1200000,
      median_inr: 2400000,
      high_inr: 3500000,
      confidence: "reported",
      sample: 40,
  },
]

const read = (base) =>
  readOffer({ base, competing: null, city: "Bengaluru", level: "senior" }, BANDS)

const above = read(3600000)
const atTop = read(3500000)
const below = read(1000000)
const atFloor = read(1200000)
const middle = read(2400000)

// --- above the ceiling ----------------------------------------------------

ok(
  /above the top of the published band/.test(above.position),
  "an offer over the ceiling says it is over the ceiling",
)
ok(
  !/near the top of the published band/.test(above.position),
  "and never calls it near the top of a band it is outside",
)
ok(/about 3% over it/.test(above.position), `it quantifies the overshoot (${above.position})`)
ok(above.counter === null, "there is nothing left to counter with")

ok(
  /near the top of the published band/.test(atTop.position),
  "an offer exactly at the ceiling is still near the top",
)
ok(
  above.position !== atTop.position,
  "negative control — above the band and at the top must not read identically",
)

// --- below the floor ------------------------------------------------------

ok(
  /below the published band entirely/.test(below.position),
  "an offer under the floor says it is under the floor",
)
ok(!/near the floor/.test(below.position), "and is not softened into 'near the floor'")
ok(/about 17% under it/.test(below.position), `it quantifies the shortfall (${below.position})`)
ok(
  /level/.test(below.counterRationale),
  "and names the likeliest cause, which is level rather than budget",
)
ok(below.counter === 2400000, "it still counters at the median")

ok(/near the floor/.test(atFloor.position), "an offer exactly at the floor is still near the floor")
ok(
  below.position !== atFloor.position,
  "negative control — below the band and at the floor must not read identically",
)

// --- the ordinary middle must be untouched --------------------------------

ok(/50th percentile/.test(middle.position), "an offer at the median still reports the 50th")
ok(middle.percentile === 50, "and the percentile itself is unchanged")
ok(
  !/above the top|below the published band/.test(middle.position),
  "an in-band offer makes no outside-the-band claim",
)

// A number the copy states must match the number the chart would draw.
ok(above.band.high_inr === 3500000, "the band reported back is the one that was matched")
ok(
  above.percentile === 100 && below.percentile === 0,
  "the raw percentile still clamps, so the chart keeps a value it can position",
)

console.log(
  failed === 0
    ? `\nPASS — ${passed} assertions on band edges`
    : `\nFAIL — ${failed} of ${passed + failed}`,
)
process.exit(failed ? 1 : 0)

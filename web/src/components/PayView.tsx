import { useState } from "react"
import { listPhrase, tiedLevels } from "@/lib/negotiate"
import type { Band, Benchmarks, Health, Pay, Settings } from "@/lib/types"
import { inr, money } from "@/lib/format"

interface Props {
  pay: Pay
  benchmarks?: Benchmarks
  settings: Settings
  health: Health
}

const LADDER = ["junior", "mid", "senior", "lead", "manager"]

/** Where this many years of experience sits, in the benchmark table's terms. */
function levelFor(years: number): string {
  if (years < 2) return "junior"
  if (years < 4) return "mid"
  if (years < 8) return "senior"
  if (years < 12) return "lead"
  return "manager"
}

function BandBar({
  label,
  low,
  median,
  high,
  max,
  marker,
}: {
  label: string
  low: number
  median: number
  high: number
  max: number
  marker?: number
}) {
  const pct = (value: number) => `${Math.min(100, (value / max) * 100)}%`
  return (
    <div className="bar-row">
      <span className="dim">{label}</span>
      <div className="bar-track">
        <div
          className="bar-fill"
          style={{ left: pct(low), width: `${Math.max(1.5, ((high - low) / max) * 100)}%` }}
        />
        <div className="bar-tick" style={{ left: pct(median) }} />
        {marker !== undefined && marker > 0 && (
          <div
            className="bar-you"
            style={{ left: pct(marker) }}
            title={`You: ${inr(marker)}`}
          />
        )}
      </div>
      <span className="mono tiny" style={{ textAlign: "right" }}>
        {inr(median)}
      </span>
    </div>
  )
}

export function PayView({ pay, benchmarks, settings, health }: Props) {
  const [city, setCity] = useState("Bengaluru")

  const bands = benchmarks?.bands ?? []
  const indiaCities = Array.from(
    new Set(bands.filter((b) => b.country === "IN").map((b) => b.city)),
  )

  const myLevel = levelFor(settings.years || 5)
  const forCity = bands.filter((b) => b.city === city)
  const mine = forCity.find((b) => b.seniority === myLevel)
  const current = settings.current_ctc ?? 0
  const target = settings.target_ctc ?? 0

  const maxCity = Math.max(1, ...forCity.map((b) => b.high_inr), current, target)

  // Where the user sits inside the published band for their level.
  let verdict: { text: string; tone: string } | null = null
  if (mine && current > 0) {
    if (current < mine.low_inr) {
      verdict = {
        text: `You are below the published floor for ${myLevel} designers in ${city}. The gap to the median is ${inr(
          mine.median_inr - current,
        )} a year, and the floor alone is ${inr(mine.low_inr - current)} away.`,
        tone: "pill-bad",
      }
    } else if (current < mine.median_inr) {
      verdict = {
        text: `You are inside the band but below the median. Asking for ${inr(
          mine.median_inr,
        )} would put you at the middle of the market, which is ${inr(
          mine.median_inr - current,
        )} more than now.`,
        tone: "pill-warn",
      }
    } else if (current < mine.high_inr) {
      verdict = {
        text: `You are above the median for ${myLevel} in ${city}. The remaining headroom to the top of the band is ${inr(
          mine.high_inr - current,
        )}, which usually means changing level rather than changing company.`,
        tone: "pill-good",
      }
    } else {
      verdict = {
        text: `You are at or above the top of the published ${myLevel} band for ${city}. Further gains realistically come from moving up a level, moving market, or equity — not from a better offer at the same level.`,
        tone: "pill-good",
      }
    }
  }

  const seniorityBands = Object.entries(pay.by_seniority).sort((a, b) => b[1].median - a[1].median)
  const unstated = pay.unstated_level
  const maxCrawled = Math.max(1, ...seniorityBands.map(([, b]) => b.p75), unstated?.p75 ?? 1)

  // Sorting bars by median produces an order whether or not the numbers differ.
  // Where consecutive levels sit within a few percent on samples this small, the
  // order is noise, and a reader taking it as a ladder would conclude the wrong
  // thing about their own next step. Name them instead of letting the sort imply.
  const tied = tiedLevels(seniorityBands)

  return (
    <div className="pane">
      <div className="pane-inner pane-wide">
        <h1 className="title">Pay</h1>
        <p className="subtitle">
          Two sources, never mixed. Published benchmarks answer what you should be earning where
          you live. Crawled postings show what employers are actually advertising right now — a
          smaller, more honest, and much more American sample.
        </p>

        {/* ------------------------------------------------ tier 2: benchmarks */}
        {bands.length > 0 && (
          <>
            <div className="row-between" style={{ marginBottom: 10 }}>
              <div className="kicker" style={{ margin: 0 }}>
                What you should be making
              </div>
              <select
                aria-label="Benchmark city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                style={{ width: "auto", padding: "4px 8px", fontSize: 12 }}
              >
                {indiaCities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="card">
              {mine ? (
                <>
                  <div className="row-between" style={{ alignItems: "flex-start", marginBottom: 14 }}>
                    <div>
                      <div className="mono" style={{ fontSize: 30, letterSpacing: "-0.02em" }}>
                        {inr(mine.median_inr)}
                      </div>
                      <div className="tiny dim">
                        median for a {myLevel} designer in {city}, on {settings.years || 5} years
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="mono tiny">
                        {inr(mine.low_inr)} – {inr(mine.high_inr)}
                      </div>
                      <div className="tiny dimmer">full published range</div>
                    </div>
                  </div>

                  {verdict ? (
                    <p className="tiny" style={{ color: "var(--ink-2)", margin: "0 0 12px" }}>
                      {verdict.text}
                    </p>
                  ) : (
                    <p className="tiny dimmer" style={{ margin: "0 0 12px" }}>
                      Add your current salary in Settings and this will tell you where you sit
                      inside the band, and what the gap is worth in rupees.
                    </p>
                  )}

                  {LADDER.filter((level) => forCity.some((b) => b.seniority === level)).map(
                    (level) => {
                      const band = forCity.find((b) => b.seniority === level)!
                      return (
                        <BandBar
                          key={level}
                          label={level === myLevel ? `${level} ← you` : level}
                          low={band.low_inr}
                          median={band.median_inr}
                          high={band.high_inr}
                          max={maxCity}
                          marker={level === myLevel ? current : undefined}
                        />
                      )
                    },
                  )}

                  <p className="tiny dimmer" style={{ marginTop: 12, marginBottom: 0 }}>
                    Bar spans the published low to high, the tick is the median, and the white line
                    is you. Source:{" "}
                    <a href={mine.source_url} target="_blank" rel="noopener noreferrer">
                      {mine.source_name}
                    </a>
                    , retrieved {mine.retrieved_at}.{" "}
                    <span className={`pill ${mine.confidence === "verified" ? "pill-good" : ""}`}>
                      {mine.confidence}
                    </span>
                  </p>
                </>
              ) : (
                <p className="tiny dim" style={{ margin: 0 }}>
                  No published band for a {myLevel} designer in {city}.
                </p>
              )}
            </div>
          </>
        )}

        {/* ------------------------------------------------ tier 1: crawled */}
        <div className="kicker" style={{ marginTop: 20 }}>
          What employers are advertising
        </div>

        <div className="grid-3" style={{ marginBottom: 12 }}>
          <div className="stat">
            <div className="n">{pay.coverage.disclosed}</div>
            <div className="l">Postings that disclosed pay</div>
            <div className="sub">
              {Math.round(pay.coverage.share * 100)}% of {pay.coverage.jobs}. The rest said nothing.
            </div>
          </div>
          <div className="stat">
            <div className="n">{pay.coverage.india_disclosed}</div>
            <div className="l">Indian postings with a band</div>
            <div className="sub">
              {pay.coverage.india_disclosed === 0
                ? "None. Indian employers almost never publish pay, which is exactly why the benchmarks above exist."
                : "Small sample — a signal, not a benchmark."}
            </div>
          </div>
          <div className="stat">
            <div className="n">{seniorityBands.length}</div>
            <div className="l">Levels with enough data</div>
            <div className="sub">Anything under three postings is not reported at all.</div>
          </div>
        </div>

        {seniorityBands.length > 0 && (
          <div className="card">
            <h3>By level, from disclosed postings</h3>
            <p className="tiny dimmer" style={{ marginTop: -4 }}>
              Converted to INR at a fixed rate and dominated by US remote roles. Useful for judging
              a foreign offer, misleading as an Indian anchor — which is why it is kept separate.
            </p>
            {seniorityBands.map(([label, band]: [string, Band]) => (
              <BandBar
                key={label}
                label={`${label} (${band.n})`}
                low={band.p25}
                median={band.median}
                high={band.p75}
                max={maxCrawled}
              />
            ))}
            {tied.length > 0 && (
              <p className="tiny dimmer" style={{ marginTop: 10 }}>
                {tied.map((run) => listPhrase(run)).join("; ")} sit within 5% of each other on
                samples this small. Those are sorted because a chart has to put them in some order,
                not because one pays more than the next.
              </p>
            )}
            {unstated && (
              <>
                <p className="tiny dimmer" style={{ marginTop: 14 }}>
                  Below the line: postings whose title and description never stated a level. They
                  are not a rung, and they are not mid-level — a plain "Product Designer" req at a
                  company like Ramp covers the whole ladder in one posting, which is why these are
                  the best-paying group on the page. Counting them as mid-level would have said you
                  earn more before a promotion than after one.
                </p>
                <BandBar
                  label={`Level not stated (${unstated.n})`}
                  low={unstated.p25}
                  median={unstated.median}
                  high={unstated.p75}
                  max={maxCrawled}
                />
              </>
            )}
          </div>
        )}

        {pay.top_paying.length > 0 && (
          <div className="card">
            <h3>Highest disclosed right now</h3>
            <table className="data">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Company</th>
                  <th>Band</th>
                  <th>In INR</th>
                </tr>
              </thead>
              <tbody>
                {pay.top_paying.slice(0, 10).map((row) => (
                  <tr key={row.url + row.title}>
                    <td>
                      <a href={row.url} target="_blank" rel="noopener noreferrer">
                        {row.title}
                      </a>
                      <div className="tiny dimmer">{row.location}</div>
                    </td>
                    <td>{row.company}</td>
                    <td className="mono tiny">
                      {money(row.band.low, row.band.currency)} –{" "}
                      {money(row.band.high, row.band.currency)}
                    </td>
                    <td className="mono tiny">
                      {inr(row.band.inr_low)} – {inr(row.band.inr_high)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card">
          <h3>What this cannot tell you</h3>
          <ul className="reasons">
            <li>
              The published bands are third-party figures, mostly marked “reported” rather than
              verified, and they drift. Treat them as a starting position in a negotiation, not a
              fact to quote.
            </li>
            <li>
              Only {Math.round(pay.coverage.share * 100)}% of crawled postings disclose pay, and
              those skew American and remote-first. The top of that range is aspirational.
            </li>
            <li>
              Equity is excluded entirely. At senior level in a funded company it can be the larger
              half of the offer.
            </li>
            <li>
              Foreign figures are not adjusted for cost of living, tax or visa reality here — the
              Advisor’s relocation tab does that, and the answer is usually less flattering.
            </li>
            <li>Rebuilt {health.generated_at.slice(0, 10)}.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

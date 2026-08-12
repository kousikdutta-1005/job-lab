import type { Band, Health, Pay, Settings } from "@/lib/types"
import { inr, money } from "@/lib/format"

interface Props {
  pay: Pay
  settings: Settings
  health: Health
}

function BandRow({ label, band, max }: { label: string; band: Band; max: number }) {
  const left = (band.p25 / max) * 100
  const width = ((band.p75 - band.p25) / max) * 100
  const median = (band.median / max) * 100
  return (
    <div className="bar-row">
      <span className="dim">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%` }} />
        <div className="bar-tick" style={{ left: `${median}%` }} />
      </div>
      <span className="mono tiny" style={{ textAlign: "right" }}>
        {inr(band.median)}
      </span>
    </div>
  )
}

export function PayView({ pay, settings, health }: Props) {
  const bands = Object.entries(pay.by_seniority)
  const max = Math.max(1, ...bands.map(([, b]) => b.p75))

  const mine = pay.by_seniority["Senior"] ?? pay.by_seniority["Mid-level"]
  const current = settings.current_ctc

  let position: string | null = null
  if (mine && current) {
    if (current < mine.p25)
      position = `You are below the 25th percentile of what these postings offer. The gap to the median is ${inr(
        mine.median - current,
      )}.`
    else if (current < mine.median)
      position = `You sit between the 25th percentile and the median. The gap to the median is ${inr(
        mine.median - current,
      )}.`
    else if (current < mine.p75) position = "You are above the median and below the 75th percentile."
    else position = "You are at or above the 75th percentile of what these postings disclose."
  }

  return (
    <div className="pane">
      <div className="pane-inner pane-wide">
        <h2 className="title">Pay</h2>
        <p className="subtitle">
          Every number here was written down by an employer in a live posting. Nothing is
          estimated, modelled or scraped from self-reported surveys — which makes the sample small
          and biased toward companies confident enough to publish a band, but makes each number
          real.
        </p>

        <div className="grid-3" style={{ marginBottom: 16 }}>
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
                ? "None. Indian employers almost never publish pay, so the Indian picture here comes from elsewhere."
                : "Small sample — read as a signal, not a benchmark."}
            </div>
          </div>
          <div className="stat">
            <div className="n">{mine ? inr(mine.median) : "—"}</div>
            <div className="l">Median at your level</div>
            <div className="sub">{mine ? `From ${mine.n} disclosed postings.` : "Not enough data yet."}</div>
          </div>
        </div>

        {position && (
          <div className="card" style={{ borderLeft: "2px solid var(--accent)" }}>
            <h3>Where you stand</h3>
            <p className="tiny" style={{ margin: 0, color: "var(--ink-2)" }}>
              {position}
            </p>
          </div>
        )}

        {bands.length > 0 && (
          <div className="card">
            <h3>By level</h3>
            <p className="tiny dimmer" style={{ marginTop: -4 }}>
              Bar spans the 25th to 75th percentile. The tick is the median. All converted to INR
              so foreign bands sit on the same axis.
            </p>
            {bands
              .sort((a, b) => b[1].median - a[1].median)
              .map(([label, band]) => (
                <BandRow key={label} label={`${label} (${band.n})`} band={band} max={max} />
              ))}
          </div>
        )}

        {Object.keys(pay.by_city).length > 0 && (
          <div className="card">
            <h3>By city</h3>
            {Object.entries(pay.by_city)
              .sort((a, b) => b[1].median - a[1].median)
              .slice(0, 12)
              .map(([label, band]) => (
                <BandRow
                  key={label}
                  label={`${label} (${band.n})`}
                  band={band}
                  max={Math.max(1, ...Object.values(pay.by_city).map((b) => b.p75))}
                />
              ))}
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
                {pay.top_paying.slice(0, 12).map((row) => (
                  <tr key={row.url + row.title}>
                    <td>
                      <a href={row.url} target="_blank" rel="noopener noreferrer">
                        {row.title}
                      </a>
                      <div className="tiny dimmer">{row.location}</div>
                    </td>
                    <td>{row.company}</td>
                    <td className="mono tiny">
                      {money(row.band.low, row.band.currency)} – {money(row.band.high, row.band.currency)}
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
              Only {Math.round(pay.coverage.share * 100)}% of postings disclose pay, and the ones
              that do skew American and remote-first. Treat the top of the range as aspirational.
            </li>
            <li>
              Foreign bands are converted at a fixed rate and are not adjusted for cost of living or
              tax. A US number is not the same money as an Indian one.
            </li>
            <li>
              Equity is excluded entirely. For senior roles at funded companies that can be the
              larger half of the offer.
            </li>
            <li>
              Sample size is shown next to every band. Anything under three postings is not
              reported at all rather than reported badly. Rebuilt {health.generated_at.slice(0, 10)}.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

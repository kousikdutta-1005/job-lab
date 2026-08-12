import { useMemo, useState } from "react"
import type { Application, Benchmarks, Settings } from "@/lib/types"
import { counterScript, readOffer } from "@/lib/negotiate"
import { copy, inr } from "@/lib/format"

interface Props {
  benchmarks?: Benchmarks
  settings: Settings
  applications: Application[]
}

const LEVELS = ["junior", "mid", "senior", "lead", "manager"]

function levelFor(years: number): string {
  if (years < 2) return "junior"
  if (years < 4) return "mid"
  if (years < 8) return "senior"
  if (years < 12) return "lead"
  return "manager"
}

const TONE_CLASS: Record<string, string> = {
  do: "pill-good",
  avoid: "pill-bad",
  note: "pill-warn",
}

export function NegotiateView({ benchmarks, settings, applications }: Props) {
  const bands = benchmarks?.bands ?? []
  const cities = Array.from(new Set(bands.filter((b) => b.country === "IN").map((b) => b.city)))

  const offers = applications.filter((a) => a.stage === "offer" || a.stage === "accepted")

  const [base, setBase] = useState<number>(0)
  const [competing, setCompeting] = useState<number>(0)
  const [city, setCity] = useState(cities[0] ?? "Bengaluru")
  const [level, setLevel] = useState(levelFor(settings.years || 5))
  const [company, setCompany] = useState(offers[0]?.company ?? "")
  const [role, setRole] = useState(offers[0]?.title ?? "")
  const [copied, setCopied] = useState(false)

  const read = useMemo(
    () =>
      readOffer(
        {
          base,
          level,
          city,
          currentCtc: settings.current_ctc,
          competing: competing || undefined,
        },
        bands,
      ),
    [base, level, city, settings.current_ctc, competing, bands],
  )

  const script = useMemo(
    () => counterScript({ base, level, city, competing: competing || undefined }, read, company, role),
    [base, level, city, competing, read, company, role],
  )

  return (
    <div className="pane">
      <div className="pane-inner">
        <h2 className="title">Negotiate</h2>
        <p className="subtitle">
          Every tracker stops at “offer” as though it were the outcome. It is the start of the only
          conversation in a job search with a six-figure spread, and the one you get least practice
          at — you do it once every few years, against someone who does it weekly.
        </p>

        <div className="card">
          <h3>The offer</h3>
          <div className="split">
            <div className="field">
              <label>Base offered (₹ per year)</label>
              <input
                type="number"
                value={base || ""}
                placeholder="2200000"
                onChange={(e) => setBase(Number(e.target.value) || 0)}
              />
            </div>
            <div className="field">
              <label>Competing offer, if any</label>
              <input
                type="number"
                value={competing || ""}
                placeholder="Leave blank if none"
                onChange={(e) => setCompeting(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="split">
            <div className="field">
              <label>City</label>
              <select value={city} onChange={(e) => setCity(e.target.value)}>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Level</label>
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="split">
            <div className="field">
              <label>Company</label>
              <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <div className="field">
              <label>Role</label>
              <input type="text" value={role} onChange={(e) => setRole(e.target.value)} />
            </div>
          </div>
        </div>

        {base > 0 && (
          <div className="card" style={{ borderLeft: "2px solid var(--accent)" }}>
            <h3>Where this offer sits</h3>
            <p className="tiny" style={{ color: "var(--ink-2)", marginTop: -2 }}>
              {read.position}
            </p>

            {read.band && (
              <>
                <div className="bar-row" style={{ marginTop: 10 }}>
                  <span className="dim">{level}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        left: 0,
                        width: "100%",
                        opacity: 0.35,
                      }}
                    />
                    <div
                      className="bar-tick"
                      style={{
                        left: `${((read.band.median_inr - read.band.low_inr) / (read.band.high_inr - read.band.low_inr)) * 100}%`,
                      }}
                    />
                    <div
                      className="bar-you"
                      style={{
                        left: `${Math.min(100, Math.max(0, ((base - read.band.low_inr) / (read.band.high_inr - read.band.low_inr)) * 100))}%`,
                      }}
                    />
                  </div>
                  <span className="mono tiny" style={{ textAlign: "right" }}>
                    {inr(base)}
                  </span>
                </div>
                <p className="tiny dimmer" style={{ margin: "4px 0 0" }}>
                  Band runs {inr(read.band.low_inr)} to {inr(read.band.high_inr)}, tick is the
                  median, white line is this offer.
                </p>
              </>
            )}

            {read.counterRationale && (
              <p className="tiny" style={{ color: "var(--ink-2)", marginTop: 12, marginBottom: 0 }}>
                {read.counterRationale}
              </p>
            )}
          </div>
        )}

        <div className="card">
          <h3>How to play it</h3>
          <div className="link-list">
            {read.moves.map((move) => (
              <div key={move.title} className="link-row" style={{ alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 550, marginBottom: 3 }}>{move.title}</div>
                  <div className="tiny dim">{move.body}</div>
                </div>
                <span className={`pill ${TONE_CLASS[move.tone]}`}>{move.tone}</span>
              </div>
            ))}
          </div>
        </div>

        {base > 0 && (
          <div className="card">
            <h3>The counter, written out</h3>
            <div className="field">
              <textarea readOnly rows={14} value={script} />
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={async () => {
                if (await copy(script)) {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1600)
                }
              }}
            >
              {copied ? "Copied" : "Copy the counter"}
            </button>
            <p className="tiny dimmer" style={{ marginTop: 10, marginBottom: 0 }}>
              Read it once and cut anything that does not sound like you. A counter that reads as
              a template is worse than a shorter one in your own words.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

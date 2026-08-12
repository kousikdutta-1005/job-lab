import { useState } from "react"
import type { Health, Settings } from "@/lib/types"
import { download, exportAll, importAll } from "@/lib/store"
import { bookmarkletFor, readiness } from "@/lib/autofill"

interface Props {
  settings: Settings
  onChange: (value: Settings) => void
  health: Health
  onRestored: () => void
}

export function SettingsView({ settings, onChange, health, onRestored }: Props) {
  const [message, setMessage] = useState<string | null>(null)

  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch })
  const { ready, missing } = readiness(settings)
  const bookmarklet = bookmarkletFor(settings)

  async function restore(file: File) {
    const text = await file.text()
    const result = importAll(text)
    setMessage(result.message)
    if (result.ok) onRestored()
  }

  return (
    <div className="pane">
      <div className="pane-inner">
        <h2 className="title">Settings</h2>
        <p className="subtitle">
          Everything on this page is stored in this browser and nowhere else. It is never sent
          anywhere, never committed to the repository, and never leaves your machine.
        </p>

        <div className="card">
          <h3>You</h3>
          <div className="split">
            <div className="field">
              <label>Full name</label>
              <input
                type="text"
                value={settings.full_name}
                onChange={(e) => set({ full_name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Years of experience</label>
              <input
                type="number"
                min={0}
                max={40}
                value={settings.years}
                onChange={(e) => set({ years: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="split">
            <div className="field">
              <label>Email</label>
              <input type="text" value={settings.email} onChange={(e) => set({ email: e.target.value })} />
            </div>
            <div className="field">
              <label>Phone</label>
              <input type="text" value={settings.phone} onChange={(e) => set({ phone: e.target.value })} />
            </div>
          </div>

          <div className="split">
            <div className="field">
              <label>Portfolio URL</label>
              <input
                type="url"
                placeholder="https://kousikdutta.com"
                value={settings.portfolio}
                onChange={(e) => set({ portfolio: e.target.value })}
              />
            </div>
            <div className="field">
              <label>LinkedIn URL</label>
              <input
                type="url"
                value={settings.linkedin}
                onChange={(e) => set({ linkedin: e.target.value })}
              />
            </div>
          </div>

          <div className="split">
            <div className="field">
              <label>Current CTC (₹ per year)</label>
              <input
                type="number"
                value={settings.current_ctc ?? ""}
                placeholder="1800000"
                onChange={(e) => set({ current_ctc: Number(e.target.value) || undefined })}
              />
            </div>
            <div className="field">
              <label>Target CTC (₹ per year)</label>
              <input
                type="number"
                value={settings.target_ctc ?? ""}
                placeholder="2800000"
                onChange={(e) => set({ target_ctc: Number(e.target.value) || undefined })}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Resume</h3>
          <p className="tiny dimmer" style={{ marginTop: -4 }}>
            Paste the plain text of your resume. Every role on the board is then scored against it
            in this browser. Copy it out of your PDF with select-all — if the paste comes out
            garbled, an applicant tracking system sees exactly the same garble, which is itself
            the most useful thing this tool can tell you.
          </p>
          <div className="field">
            <label>Version label</label>
            <input
              type="text"
              placeholder="e.g. 2026 product design"
              value={settings.resume_name}
              onChange={(e) => set({ resume_name: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Resume text ({settings.resume_text.length.toLocaleString()} characters)</label>
            <textarea
              rows={12}
              value={settings.resume_text}
              placeholder="Paste here…"
              onChange={(e) => set({ resume_text: e.target.value })}
            />
          </div>
        </div>


        <div className="card">
          <h3>Autofill bookmarklet</h3>
          <p className="tiny dimmer" style={{ marginTop: -4 }}>
            Drag this to your bookmarks bar once. On any Greenhouse, Lever, Ashby or Workable
            application form, click it and your name, email, phone, portfolio and LinkedIn fill
            themselves. It works because it runs inside the ATS page rather than this one, with
            your details baked into the bookmark — nothing is sent anywhere, including to us.
          </p>
          {ready ? (
            <>
              <a
                className="btn btn-primary btn-sm"
                href={bookmarklet}
                onClick={(e) => e.preventDefault()}
                draggable
                title="Drag me to the bookmarks bar"
                style={{ cursor: "grab" }}
              >
                ⇱ Fill this form — drag me up
              </a>
              <p className="tiny dimmer" style={{ marginTop: 10, marginBottom: 0 }}>
                It deliberately does not press submit. Auto-submitted applications are recognisable
                and get binned; the tedious fields are worth automating, the answers are not.
                Re-drag it whenever you change your details above.
              </p>
            </>
          ) : (
            <p className="tiny" style={{ color: "var(--warn)", margin: 0 }}>
              Fill in your {missing.join(", ")} above and the bookmarklet appears here.
            </p>
          )}
        </div>

        <div className="card">
          <h3>Backup</h3>
          <p className="tiny dimmer" style={{ marginTop: -4 }}>
            There is no server, so there is no backup but this one. Clearing site data wipes your
            applications and contacts permanently. Export now and again.
          </p>
          <div className="row wrap" style={{ gap: 7 }}>
            <button
              className="btn btn-sm"
              onClick={() => download(`job-lab-backup-${new Date().toISOString().slice(0, 10)}.json`, exportAll())}
            >
              Export everything
            </button>
            <label className="btn btn-sm" style={{ cursor: "pointer" }}>
              Restore from file
              <input
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void restore(file)
                }}
              />
            </label>
          </div>
          {message && (
            <p className="tiny" style={{ marginTop: 9, color: "var(--good)" }}>
              {message}
            </p>
          )}
        </div>

        <div className="card">
          <h3>Where the board comes from</h3>
          <table className="data">
            <tbody>
              <tr>
                <td>Last rebuilt</td>
                <td className="mono">{health.generated_at}</td>
              </tr>
              <tr>
                <td>Companies with a verified board</td>
                <td className="mono">
                  {health.counts.companies_with_board} of {health.counts.companies_in_registry}
                </td>
              </tr>
              <tr>
                <td>Design roles found</td>
                <td className="mono">{health.counts.jobs}</td>
              </tr>
              <tr>
                <td>Roles you can actually take</td>
                <td className="mono">{health.counts.eligible}</td>
              </tr>
              <tr>
                <td>Duplicates merged</td>
                <td className="mono">{health.counts.duplicates_removed}</td>
              </tr>
              <tr>
                <td>Sources</td>
                <td className="mono tiny">
                  {Object.entries(health.by_source)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(" · ")}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="tiny dimmer" style={{ marginTop: 10, marginBottom: 0 }}>
            Job data comes from the public ATS APIs companies publish themselves — Greenhouse,
            Lever, Ashby, Workable, SmartRecruiters, Recruitee and Workday — plus open
            aggregators for the long tail: Remotive, RemoteOK, Jobicy, Himalayas, Arbeitnow,
            We Work Remotely, and Hacker News “Who is hiring”. Roles relayed by Remotive and
            RemoteOK link back to the original posting, as their terms require. Nothing here is
            scraped from behind a login.
          </p>
        </div>
      </div>
    </div>
  )
}

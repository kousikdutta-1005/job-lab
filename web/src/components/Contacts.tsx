import { useMemo, useState } from "react"
import type { Application, Contact, Job, Settings } from "@/lib/types"
import { today, uid } from "@/lib/store"
import { ago, copy, initials, titleCase } from "@/lib/format"
import { drafts as emailDrafts, linkedinDrafts, mailto } from "@/lib/email"

interface Props {
  contacts: Contact[]
  applications: Application[]
  jobs: Job[]
  settings: Settings
  strengths: string[]
  idf: Record<string, number>
  onChange: (rows: Contact[]) => void
}

const RELATIONSHIPS: Array<Contact["relationship"]> = [
  "hiring_manager",
  "recruiter",
  "referral",
  "employee",
  "other",
]

const BLANK = {
  name: "",
  title: "",
  company: "",
  email: "",
  linkedin_url: "",
  relationship: "hiring_manager" as Contact["relationship"],
  notes: "",
}

export function Contacts({
  contacts,
  applications,
  jobs,
  settings,
  strengths,
  idf,
  onChange,
}: Props) {
  const [form, setForm] = useState(BLANK)
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState<string | null>(null)
  const [writingTo, setWritingTo] = useState<string | null>(null)
  const [draftKey, setDraftKey] = useState<string>("li_connect")
  const [copied, setCopied] = useState(false)


  /* The role you are chasing at their company, so a draft can name it. Falls
     back to any live posting there, then to nothing — a message with no role in
     it is still a legitimate thing to send. */
  function jobFor(contact: Contact): Job | null {
    const company = contact.company.toLowerCase().trim()
    const tracked = applications.find(
      (a) => a.company.toLowerCase().trim() === company && a.job_id,
    )
    if (tracked?.job_id) {
      const found = jobs.find((j) => j.id === tracked.job_id)
      if (found) return found
    }
    const onBoard = jobs.filter((j) => j.company.toLowerCase().trim() === company)
    if (!onBoard.length) return null
    return onBoard.sort((a, b) => b.match_score - a.match_score)[0]
  }

  function draftsFor(contact: Contact) {
    const job = jobFor(contact)
    const li = linkedinDrafts(job, settings, idf, contact.name, contact.title, strengths)
    const mail = job ? emailDrafts(job, settings, idf, contact.name.split(/\s+/)[0] || "there") : []
    return { job, all: [...li, ...mail] }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter((c) =>
      `${c.name} ${c.company} ${c.title} ${c.email ?? ""}`.toLowerCase().includes(q),
    )
  }, [contacts, query])

  const companiesApplied = useMemo(
    () => new Set(applications.map((a) => a.company.toLowerCase())),
    [applications],
  )

  function add(event: React.FormEvent) {
    event.preventDefault()
    if (!form.name.trim() && !form.linkedin_url.trim()) return
    onChange([
      {
        id: uid(),
        ...form,
        name: form.name.trim() || "(from LinkedIn)",
        added: today(),
      },
      ...contacts,
    ])
    setForm(BLANK)
  }

  function update(id: string, patch: Partial<Contact>) {
    onChange(contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  return (
    <div className="pane">
      <div className="pane-inner pane-wide">
        <h2 className="title">Contacts</h2>
        <p className="subtitle">
          Your own network, built by hand. When you find the head of design at a company you want,
          drop their LinkedIn URL here — this is the part no crawler can do for you, and the part
          that actually gets replies.
        </p>

        <div className="card">
          <h3>Add someone</h3>
          <form onSubmit={add}>
            <div className="split">
              <div className="field">
                <label>Name</label>
                <input
                  type="text"
                  value={form.name}
                  placeholder="Ananya Rao"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Title</label>
                <input
                  type="text"
                  value={form.title}
                  placeholder="Head of Design"
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
            </div>

            <div className="split">
              <div className="field">
                <label>Company</label>
                <input
                  type="text"
                  value={form.company}
                  placeholder="Adobe"
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Relationship</label>
                <select
                  value={form.relationship}
                  onChange={(e) =>
                    setForm({ ...form, relationship: e.target.value as Contact["relationship"] })
                  }
                >
                  {RELATIONSHIPS.map((r) => (
                    <option key={r} value={r}>
                      {titleCase(r)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="split">
              <div className="field">
                <label>LinkedIn URL</label>
                <input
                  type="url"
                  value={form.linkedin_url}
                  placeholder="https://linkedin.com/in/…"
                  onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Email</label>
                <input
                  type="text"
                  value={form.email}
                  placeholder="ananya.rao@adobe.com"
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>

            <div className="field">
              <label>Notes</label>
              <textarea
                rows={2}
                value={form.notes}
                placeholder="How you found them, anything you know about the team…"
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            <button className="btn btn-primary btn-sm" type="submit">
              Save contact
            </button>
          </form>
        </div>

        {contacts.length > 0 && (
          <>
            <div className="row-between" style={{ margin: "18px 0 10px" }}>
              <div className="kicker" style={{ margin: 0 }}>
                {contacts.length} saved
              </div>
              <input
                type="text"
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ width: 200 }}
              />
            </div>

            <table className="data">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Company</th>
                  <th>Reach them</th>
                  <th>Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((contact) => (
                  <tr key={contact.id}>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <span
                          className="mono"
                          style={{
                            width: 24,
                            height: 24,
                            display: "grid",
                            placeItems: "center",
                            borderRadius: 6,
                            background: "var(--bg-hover)",
                            fontSize: 10,
                            color: "var(--ink-3)",
                            flexShrink: 0,
                          }}
                        >
                          {initials(contact.name)}
                        </span>
                        <div>
                          <div style={{ color: "var(--ink)", fontWeight: 520 }}>{contact.name}</div>
                          <div className="tiny dimmer">{contact.title || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {contact.company}
                      {companiesApplied.has(contact.company.toLowerCase()) && (
                        <div>
                          <span className="pill pill-good tiny">you applied here</span>
                        </div>
                      )}
                    </td>
                    <td className="tiny">
                      <div className="row" style={{ gap: 8 }}>
                        {contact.linkedin_url && (
                          <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer">
                            LinkedIn
                          </a>
                        )}
                        {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
                        {!contact.linkedin_url && !contact.email && (
                          <span className="dimmer">no route yet</span>
                        )}
                      </div>
                    </td>
                    <td className="tiny dimmer">{ago(contact.added)}</td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <button
                          className="chip"
                          onClick={() => {
                            setWritingTo(writingTo === contact.id ? null : contact.id)
                            setDraftKey("li_connect")
                            setCopied(false)
                          }}
                        >
                          {writingTo === contact.id ? "close" : "write"}
                        </button>
                        <button
                          className="chip"
                          onClick={() => setEditing(editing === contact.id ? null : contact.id)}
                        >
                          {editing === contact.id ? "done" : "edit"}
                        </button>
                        <button
                          className="chip"
                          style={{ color: "var(--bad)" }}
                          onClick={() => onChange(contacts.filter((c) => c.id !== contact.id))}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {writingTo &&
              (() => {
                const contact = contacts.find((c) => c.id === writingTo)
                if (!contact) return null
                const { job, all } = draftsFor(contact)
                const draft = all.find((d) => d.key === draftKey) ?? all[0]
                if (!draft) return null
                const over = draft.limit ? draft.body.length - draft.limit : 0
                return (
                  <div className="card" style={{ marginTop: 12 }}>
                    <div className="row-between" style={{ marginBottom: 4 }}>
                      <h3 style={{ margin: 0 }}>
                        Writing to {contact.name.split(/\s+/)[0]}
                        {job ? <span className="dim"> about {job.title}</span> : null}
                      </h3>
                      {contact.linkedin_url && (
                        <a
                          href={contact.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tiny"
                        >
                          their profile →
                        </a>
                      )}
                    </div>
                    {!job && (
                      <p className="tiny dimmer" style={{ marginTop: 0 }}>
                        Nothing on the board at {contact.company} right now, so these are written
                        without a role in them. That is often the better message anyway.
                      </p>
                    )}

                    <div className="row wrap" style={{ gap: 6, margin: "8px 0 10px" }}>
                      {all.map((d) => (
                        <button
                          key={d.key}
                          className={`chip ${d.key === draft.key ? "on" : ""}`}
                          onClick={() => {
                            setDraftKey(d.key)
                            setCopied(false)
                          }}
                        >
                          {d.medium === "linkedin" ? "in · " : "@ · "}
                          {d.label}
                        </button>
                      ))}
                    </div>

                    <p className="tiny dimmer" style={{ margin: "0 0 8px" }}>
                      {draft.when}
                    </p>

                    {draft.subject && (
                      <div className="field">
                        <label>Subject</label>
                        <input readOnly value={draft.subject} />
                      </div>
                    )}

                    <textarea readOnly rows={draft.medium === "linkedin" ? 7 : 12} value={draft.body} />

                    <div className="row-between" style={{ marginTop: 8 }}>
                      <span
                        className="tiny mono"
                        style={{ color: over > 0 ? "var(--bad)" : "var(--ink-4)" }}
                      >
                        {draft.limit
                          ? over > 0
                            ? `${draft.body.length} characters — ${over} over LinkedIn's ${draft.limit} limit`
                            : `${draft.body.length} of ${draft.limit} characters`
                          : `${draft.body.length} characters`}
                      </span>
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          className="chip"
                          onClick={() => {
                            copy(draft.body)
                            setCopied(true)
                            update(contact.id, { last_contacted: today() })
                          }}
                        >
                          {copied ? "copied, and logged" : "copy"}
                        </button>
                        {draft.medium !== "linkedin" && contact.email && (
                          <a
                            className="btn btn-sm"
                            href={mailto(contact.email, draft.subject, draft.body)}
                            onClick={() => update(contact.id, { last_contacted: today() })}
                          >
                            Open in mail
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}

            {editing && (
              <div className="card" style={{ marginTop: 12 }}>
                {(() => {
                  const contact = contacts.find((c) => c.id === editing)
                  if (!contact) return null
                  return (
                    <>
                      <h3>Editing {contact.name}</h3>
                      <div className="split">
                        <div className="field">
                          <label>Email</label>
                          <input
                            type="text"
                            value={contact.email ?? ""}
                            onChange={(e) => update(contact.id, { email: e.target.value })}
                          />
                        </div>
                        <div className="field">
                          <label>Last contacted</label>
                          <input
                            type="date"
                            value={contact.last_contacted ?? ""}
                            onChange={(e) => update(contact.id, { last_contacted: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="field">
                        <label>Notes</label>
                        <textarea
                          rows={3}
                          value={contact.notes ?? ""}
                          onChange={(e) => update(contact.id, { notes: e.target.value })}
                        />
                      </div>
                    </>
                  )
                })()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

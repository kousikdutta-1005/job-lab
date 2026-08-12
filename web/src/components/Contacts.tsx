import { useMemo, useState } from "react"
import type { Application, Contact } from "@/lib/types"
import { today, uid } from "@/lib/store"
import { ago, initials, titleCase } from "@/lib/format"

interface Props {
  contacts: Contact[]
  applications: Application[]
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

export function Contacts({ contacts, applications, onChange }: Props) {
  const [form, setForm] = useState(BLANK)
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState<string | null>(null)

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

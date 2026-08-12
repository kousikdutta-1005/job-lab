import { useState } from "react"
import { startSession, verify } from "@/lib/auth"

export function Login({ onPass }: { onPass: () => void }) {
  const [user, setUser] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setFailed(false)
    const ok = await verify(user, password)
    setBusy(false)
    if (ok) {
      startSession()
      onPass()
    } else {
      setFailed(true)
      setPassword("")
    }
  }

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <div className="brand" style={{ marginBottom: 20 }}>
          <span className="brand-dot" />
          job-lab
        </div>

        <h1>Your career desk.</h1>
        <p>
          Live design roles, the people who hire for them, and everything you have sent — rebuilt
          every night while you sleep.
        </p>

        <div className="field">
          <label htmlFor="u">User</label>
          <input
            id="u"
            type="text"
            autoComplete="username"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="p">Password</label>
          <input
            id="p"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button className="btn btn-primary btn-full" type="submit" disabled={busy}>
          {busy ? "checking…" : "Unlock"}
        </button>

        {failed && <div className="error">That is not right. Try again.</div>}

        <p className="note">
          This is a lock, not a vault. The site is static, so the check runs in your browser against
          a PBKDF2 hash — good enough to keep the board private, not good enough to protect a
          secret. Nothing personal is ever built into the site: your applications, contacts and
          resume live only in this browser.
        </p>
      </form>
    </div>
  )
}

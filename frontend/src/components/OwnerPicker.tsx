import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AppUser } from '../types'
import { nameFromEmail } from '../utils/people'

// Owner selector: a dropdown of people who have accessed the app (real names from
// sign-in), plus an "Other email…" escape hatch that derives the name from the email.
export default function OwnerPicker({ email, onChange }: {
  email: string
  onChange: (email: string, name: string) => void
}) {
  const [users, setUsers] = useState<AppUser[] | null>(null)
  const [manual, setManual] = useState(false)

  useEffect(() => { api.listUsers().then(setUsers).catch(() => setUsers([])) }, [])

  // Once the roster loads, start in manual mode if the current owner isn't a known user.
  useEffect(() => {
    if (users) setManual(!!email && !users.some(u => u.email === email))
  }, [users]) // eslint-disable-line react-hooks/exhaustive-deps

  const known = users ?? []
  const isKnown = known.some(u => u.email === email)

  function pick(v: string) {
    if (v === '__other__') { setManual(true); onChange('', ''); return }
    const u = known.find(x => x.email === v)
    onChange(v, u?.display_name || nameFromEmail(v))
  }

  if (manual) {
    return (
      <>
        <input
          type="email"
          autoFocus
          value={email}
          onChange={e => onChange(e.target.value.trim().toLowerCase(), nameFromEmail(e.target.value))}
          placeholder="name@machinalabs.ai"
        />
        <div className="field-hint">
          {email && <>Recorded as <strong>{nameFromEmail(email) || '—'}</strong>. </>}
          {known.length > 0 && (
            <button type="button" onClick={() => setManual(false)}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--orange, #FF9900)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              Choose from list
            </button>
          )}
        </div>
      </>
    )
  }

  return (
    <select value={isKnown ? email : ''} onChange={e => pick(e.target.value)}>
      <option value="" disabled>Select a person…</option>
      {known.map(u => (
        <option key={u.email} value={u.email}>
          {(u.display_name || nameFromEmail(u.email))} — {u.email}
        </option>
      ))}
      <option value="__other__">Other email…</option>
    </select>
  )
}

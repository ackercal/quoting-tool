import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import type { SalesforceOptions, ProjectCode, ProjectCodeEvent } from '../api/client'
import { useUser } from '../user'

// ─────────────────────────────────────────────────────────────────────────────
// Project Code tab. Two views:
//   • List (default) — project codes with status + status history; plus a
//     read-only Salesforce list for reference.
//   • Generate — classify the work (internal vs customer, team / SF account +
//     opportunity) and generate a new project code.
// Codes are <PREFIX><NNN>; prefix from the ported Databricks letter logic, NNN a
// per-prefix counter. Statuses: Discovery / Completed / Closed Won / Closed Lost.
// ─────────────────────────────────────────────────────────────────────────────

const INTERNAL_TEAMS = ['Bellator', 'Auto', 'Sustainment', 'Product', 'R&D', 'Software', 'MechE', 'Other']
// Editable status options differ by work type.
const CUSTOMER_STATUSES = ['Discovery', 'Completed', 'Closed Won', 'Closed Lost']
const INTERNAL_STATUSES = ['Internal', 'Completed']
// "Open" filter = active/not-done.
const OPEN_STATUSES = new Set(['Discovery', 'Closed Won', 'Internal'])

type WorkType = 'internal' | 'customer' | null
interface ComboOption { value: string; label: string; sub?: string }

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s.replace(' ', 'T') + (s.includes('T') ? '' : 'Z'))
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtWhen(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s.replace(' ', 'T') + (s.includes('T') ? '' : 'Z'))
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function money(n: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function statusPillStyle(status: string): React.CSSProperties {
  const colors: Record<string, [string, string]> = {
    'Discovery':   ['rgba(255,153,0,0.12)', '#b46b00'],
    'Internal':    ['#ece9f7', '#5b4a9e'],
    'Completed':   ['#e6eefb', '#2456a6'],
    'Closed Won':  ['#e6f4ea', '#256a3a'],
    'Closed Lost': ['#fdeaea', '#a13b3b'],
  }
  const [bg, fg] = colors[status] || ['var(--gray-100)', 'var(--gray-600)']
  return {
    display: 'inline-block', fontSize: 12, fontWeight: 600, borderRadius: 20, padding: '2px 10px',
    background: bg, color: fg,
  }
}

// ── Searchable dropdown ───────────────────────────────────────────────────────
function Combo({
  options, value, onChange, placeholder, disabled, emptyText,
}: {
  options: ComboOption[]; value: string | null; onChange: (v: string | null) => void
  placeholder: string; disabled?: boolean; emptyText?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value) || null

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const src = q
      ? options.filter(o => o.label.toLowerCase().includes(q) || (o.sub || '').toLowerCase().includes(q))
      : options
    return src.slice(0, 60)
  }, [options, query])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div
        onClick={() => { if (!disabled) { setOpen(o => !o); setQuery('') } }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          border: '1px solid var(--gray-300)', borderRadius: 8, padding: '9px 12px',
          background: disabled ? 'var(--gray-100)' : '#fff', cursor: disabled ? 'not-allowed' : 'pointer',
          color: disabled ? 'var(--gray-400)' : selected ? 'var(--gray-900)' : 'var(--gray-400)', fontSize: 14,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {selected && !disabled && (
            <span onClick={e => { e.stopPropagation(); onChange(null) }} title="Clear"
              style={{ color: 'var(--gray-400)', fontSize: 16, lineHeight: 1 }}>×</span>
          )}
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      {open && !disabled && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30, background: '#fff',
          border: '1px solid var(--gray-200)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
        }}>
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Type to search…"
            style={{ width: '100%', border: 'none', borderBottom: '1px solid var(--gray-200)', padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '10px 12px', color: 'var(--gray-400)', fontSize: 13 }}>{emptyText || 'No matches'}</div>
            )}
            {filtered.map(o => (
              <div key={o.value} onClick={() => { onChange(o.value); setOpen(false) }}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 14, background: o.value === value ? 'var(--gray-100)' : '#fff' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--gray-100)')}
                onMouseLeave={e => (e.currentTarget.style.background = o.value === value ? 'var(--gray-100)' : '#fff')}>
                <div style={{ color: 'var(--gray-900)' }}>{o.label}</div>
                {o.sub && <div style={{ color: 'var(--gray-400)', fontSize: 12 }}>{o.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 6 }}>{children}</div>
}

// Free-text input with Salesforce suggestions. The typed text IS the value
// (so a name not in Salesforce is allowed); picking a suggestion also captures
// its record id via onPick.
function AutoInput({
  value, onChangeText, onPick, options, placeholder, disabled,
}: {
  value: string; onChangeText: (t: string) => void; onPick: (o: ComboOption) => void
  options: ComboOption[]; placeholder: string; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const q = value.trim().toLowerCase()
  const filtered = useMemo(() => {
    const src = q ? options.filter(o => o.label.toLowerCase().includes(q) || (o.sub || '').toLowerCase().includes(q)) : options
    return src.slice(0, 60)
  }, [options, q])
  const exact = options.some(o => o.label.toLowerCase() === q)

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        value={value}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={e => { onChangeText(e.target.value); setOpen(true) }}
        placeholder={placeholder}
        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--gray-300)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', background: disabled ? 'var(--gray-100)' : '#fff' }}
      />
      {open && !disabled && (filtered.length > 0 || (!!q && !exact)) && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
          {!!q && !exact && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--gray-500)', borderBottom: filtered.length ? '1px solid var(--gray-100)' : 'none' }}>
              Not in Salesforce — “<span style={{ color: 'var(--gray-800)', fontWeight: 600 }}>{value.trim()}</span>” will be added as new.
            </div>
          )}
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filtered.map(o => (
              <div key={o.value} onClick={() => { onPick(o); setOpen(false) }}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 14 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--gray-100)')}
                onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                <div style={{ color: 'var(--gray-900)' }}>{o.label}</div>
                {o.sub && <div style={{ color: 'var(--gray-400)', fontSize: 12 }}>{o.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 12px', background: 'var(--gray-100)', borderBottom: '1px solid var(--gray-200)', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 }
const td: React.CSSProperties = { fontSize: 13, color: 'var(--gray-800)', padding: '10px 12px', borderBottom: '1px solid var(--gray-100)', verticalAlign: 'top' }

// ── History line rendering ────────────────────────────────────────────────────
const FIELD_LABEL: Record<string, string> = { status: 'Status', customer: 'Customer', project_name: 'Project name' }

function HistoryLine({ e }: { e: ProjectCodeEvent }) {
  const who = e.changed_by_name || e.changed_by || 'unknown'
  const when = fmtWhen(e.changed_at)
  const label = FIELD_LABEL[e.field] || e.field
  // The very first status event (no old value) reads as creation.
  const body = e.field === 'status' && !e.old_value
    ? <><span style={{ color: 'var(--gray-500)' }}>Created as </span><span style={{ fontWeight: 600 }}>{e.new_value}</span></>
    : <><span style={{ color: 'var(--gray-500)' }}>{label}: {e.old_value || '—'} → </span><span style={{ fontWeight: 600 }}>{e.new_value || '—'}</span></>
  return (
    <div style={{ fontSize: 13, color: 'var(--gray-800)' }}>
      {body}<span style={{ color: 'var(--gray-500)' }}> · {who} · {when}</span>
    </div>
  )
}

// ── Row expansion: view + edit + history ──────────────────────────────────────
function CodeDetail({ code, onUpdate }: { code: ProjectCode; onUpdate: (c: ProjectCode) => void }) {
  const [history, setHistory] = useState<ProjectCodeEvent[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dStatus, setDStatus] = useState(code.status)
  const [dCustomer, setDCustomer] = useState(code.customer || '')
  const [dProject, setDProject] = useState(code.project_name || '')

  function loadHistory() {
    api.getProjectCodeHistory(code.id).then(setHistory).catch(() => setHistory([]))
  }
  useEffect(() => {
    let alive = true
    api.getProjectCodeHistory(code.id).then(h => { if (alive) setHistory(h) }).catch(() => { if (alive) setHistory([]) })
    return () => { alive = false }
  }, [code.id])

  function startEdit() {
    setDStatus(code.status); setDCustomer(code.customer || ''); setDProject(code.project_name || '')
    setEditing(true)
  }

  const statusOptions = code.work_type === 'internal' ? INTERNAL_STATUSES : CUSTOMER_STATUSES
  // Names sourced from Salesforce can't be edited here; typed-in ones can.
  const lockCustomer = !!code.sf_account_id
  const lockProject = !!code.sf_opp_id

  async function save() {
    setSaving(true)
    try {
      const updated = await api.updateProjectCode(code.id, {
        status: dStatus,
        ...(lockCustomer ? {} : { customer: dCustomer }),
        ...(lockProject ? {} : { project_name: dProject }),
      })
      onUpdate(updated)
      setEditing(false)
      loadHistory()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '14px 16px', background: 'var(--gray-50, #f9f9f9)' }}>
      {/* View / edit */}
      {!editing ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          <button onClick={startEdit}
            style={{ fontSize: 13, fontWeight: 600, border: '1px solid var(--gray-300)', background: '#fff', color: 'var(--gray-700)', borderRadius: 8, padding: '7px 16px', cursor: 'pointer' }}>
            Edit
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: 18, maxWidth: 520 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Status</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {statusOptions.map(s => (
                <button key={s} onClick={() => setDStatus(s)}
                  style={{
                    fontSize: 13, fontWeight: 600, borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
                    border: `1.5px solid ${s === dStatus ? 'var(--orange, #FF9900)' : 'var(--gray-300)'}`,
                    background: s === dStatus ? 'rgba(255,153,0,0.10)' : '#fff',
                    color: s === dStatus ? 'var(--gray-900)' : 'var(--gray-700)',
                  }}>{s}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <Label>Customer Name {lockCustomer && <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(from Salesforce)</span>}</Label>
            <input value={dCustomer} onChange={e => setDCustomer(e.target.value)} placeholder="Customer name" disabled={lockCustomer} readOnly={lockCustomer}
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--gray-300)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', background: lockCustomer ? 'var(--gray-100)' : '#fff', color: lockCustomer ? 'var(--gray-500)' : 'var(--gray-900)', cursor: lockCustomer ? 'not-allowed' : 'text' }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <Label>Project Name {lockProject && <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(from Salesforce)</span>}</Label>
            <input value={dProject} onChange={e => setDProject(e.target.value)} placeholder="Project name" disabled={lockProject} readOnly={lockProject}
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--gray-300)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', background: lockProject ? 'var(--gray-100)' : '#fff', color: lockProject ? 'var(--gray-500)' : 'var(--gray-900)', cursor: lockProject ? 'not-allowed' : 'text' }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={save} disabled={saving}
              style={{ fontSize: 13, fontWeight: 600, border: 'none', background: 'var(--orange, #FF9900)', color: '#fff', borderRadius: 8, padding: '8px 18px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button onClick={() => setEditing(false)} disabled={saving}
              style={{ fontSize: 13, fontWeight: 600, border: '1px solid var(--gray-300)', background: '#fff', color: 'var(--gray-700)', borderRadius: 8, padding: '8px 18px', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 10 }}>The project code ({code.code}) never changes.</div>
        </div>
      )}

      {/* History */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>History</div>
        {history === null && <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Loading…</div>}
        {history !== null && history.length === 0 && <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>No changes recorded (imported from Salesforce).</div>}
        {history !== null && history.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map(e => <HistoryLine key={e.id} e={e} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── List view ─────────────────────────────────────────────────────────────────
type FilterKey = 'open' | 'all' | 'Discovery' | 'Internal' | 'Completed' | 'Closed Won' | 'Closed Lost'
const FILTER_ORDER: { key: FilterKey; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'Discovery', label: 'Discovery' },
  { key: 'Internal', label: 'Internal' },
  { key: 'Closed Won', label: 'Closed Won' },
  { key: 'Completed', label: 'Completed' },
  { key: 'Closed Lost', label: 'Closed Lost' },
  { key: 'all', label: 'All' },
]

function ListView({ sf, sfLoading, reloadSf }: { sf: SalesforceOptions | null; sfLoading: boolean; reloadSf: (refresh?: boolean) => void }) {
  const { isAdmin } = useUser()
  const [codes, setCodes] = useState<ProjectCode[]>([])
  const [seeded, setSeeded] = useState(true)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('open')
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [openCodes, setOpenCodes] = useState(true)
  const [openSf, setOpenSf] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const params: { status?: string; q?: string; open?: boolean } = {}
      if (filter === 'open') params.open = true
      else if (filter !== 'all') params.status = filter
      if (q.trim()) params.q = q.trim()
      const data = await api.listProjectCodes(params)
      setCodes(data.codes)
      setSeeded(data.seeded)
    } finally {
      setLoading(false)
    }
  }

  // Reload on filter change + debounced search.
  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [filter, q]) // eslint-disable-line react-hooks/exhaustive-deps

  async function runSeed() {
    setSeeding(true)
    try {
      await api.seedProjectCodes()
      await load()
    } finally {
      setSeeding(false)
    }
  }

  const accountName = useMemo(() => {
    const m = new Map<string, string>()
    sf?.accounts.forEach(a => m.set(a.id, a.name))
    return m
  }, [sf])

  const filterBtn = (key: FilterKey, label: string) => (
    <button key={key} onClick={() => setFilter(key)} style={{
      fontSize: 13, fontWeight: 600, borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
      border: `1px solid ${filter === key ? 'var(--orange, #FF9900)' : 'var(--gray-300)'}`,
      background: filter === key ? 'var(--orange, #FF9900)' : '#fff',
      color: filter === key ? '#fff' : 'var(--gray-700)',
    }}>{label}</button>
  )

  const sectionBar = (open: boolean, toggle: () => void, title: string, subtitle: string, right?: React.ReactNode) => (
    <div onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--gray-200)', paddingBottom: 10, cursor: 'pointer' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 2 }}>{subtitle}</div>
      </div>
      {right}
      <svg width="14" height="14" viewBox="0 0 12 12"
        style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
        <title>{open ? 'Collapse' : 'Expand'}</title>
        <path d="M3 1.5l6 4.5-6 4.5z" fill="var(--gray-500)" />
      </svg>
    </div>
  )

  return (
    <div>
      {sectionBar(openCodes, () => setOpenCodes(o => !o), 'Project Code List', 'View and update status.')}

      {openCodes && (
        <div style={{ marginTop: 16 }}>
          {!seeded && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', background: 'rgba(255,153,0,0.08)', border: '1px solid rgba(255,153,0,0.3)', borderRadius: 10, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--gray-800)' }}>No project codes yet. Do a one-time import of the existing Salesforce codes as a starting point — after this, the list only grows from codes generated here.</div>
              {isAdmin
                ? <button onClick={runSeed} disabled={seeding} style={{ fontSize: 13, fontWeight: 600, border: 'none', background: 'var(--orange, #FF9900)', color: '#fff', borderRadius: 8, padding: '7px 14px', cursor: seeding ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                    {seeding ? 'Importing…' : 'Import existing codes (one-time)'}
                  </button>
                : <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Ask an admin to import.</span>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
            {FILTER_ORDER.map(f => filterBtn(f.key, f.label))}
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search code, customer, project…"
              style={{ marginLeft: 'auto', minWidth: 240, border: '1px solid var(--gray-300)', borderRadius: 8, padding: '7px 12px', fontSize: 13, outline: 'none' }} />
          </div>

          <div style={{ border: '1px solid var(--gray-200)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ overflow: 'auto', maxHeight: 440 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr>
                    <th style={th}>Project Code</th><th style={th}>Status</th><th style={th}>Customer</th>
                    <th style={th}>Project Name</th><th style={th}>Created</th><th style={th}>Status Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td style={td} colSpan={6}>Loading…</td></tr>}
                  {!loading && codes.length === 0 && <tr><td style={{ ...td, color: 'var(--gray-400)' }} colSpan={6}>No project codes match.</td></tr>}
                  {!loading && codes.map(c => (
                    <Fragment key={c.id}>
                      <tr onClick={() => setExpanded(expanded === c.id ? null : c.id)} style={{ cursor: 'pointer', background: expanded === c.id ? 'var(--gray-50, #f9f9f9)' : '#fff' }}>
                        <td style={{ ...td, fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>{c.code}</td>
                        <td style={td}><span style={statusPillStyle(c.status)}>{c.status}</span></td>
                        <td style={td}>{c.customer || '—'}</td>
                        <td style={td}>{c.project_name || '—'}</td>
                        <td style={td}>{fmtDate(c.created_at)}</td>
                        <td style={td}>{fmtDate(c.status_updated_at)}</td>
                      </tr>
                      {expanded === c.id && (
                        <tr>
                          <td colSpan={6} style={{ padding: 0, borderBottom: '1px solid var(--gray-100)' }}>
                            <CodeDetail code={c} onUpdate={updated => {
                              setCodes(prev => prev.map(x => x.id === updated.id ? updated : x)
                                .filter(x => filter === 'all' ? true : filter === 'open' ? OPEN_STATUSES.has(x.status) : x.status === filter))
                            }} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Salesforce list (reference) ── */}
      <div style={{ marginTop: 28 }}>
        {sectionBar(openSf, () => setOpenSf(o => !o), 'Salesforce List', 'Reference list of Salesforce opportunities.',
          <button onClick={e => { e.stopPropagation(); reloadSf(true) }} disabled={sfLoading}
            title="Re-pull accounts & opportunities from Salesforce"
            style={{ fontSize: 12, fontWeight: 600, border: '1px solid var(--gray-300)', background: '#fff', color: 'var(--gray-700)', borderRadius: 8, padding: '6px 12px', cursor: sfLoading ? 'default' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {sfLoading ? 'Refreshing…' : 'Refresh'}
          </button>)}
        {openSf && (
          <div style={{ marginTop: 16 }}>
            <SalesforceList sf={sf} sfLoading={sfLoading} accountName={accountName} />
          </div>
        )}
      </div>
    </div>
  )
}

function SalesforceList({ sf, sfLoading, accountName }: { sf: SalesforceOptions | null; sfLoading: boolean; accountName: Map<string, string> }) {
  const [q, setQ] = useState('')
  const codeByOpp = sf?.code_by_opp || {}
  const rows = useMemo(() => {
    const opps = sf?.opportunities || []
    const query = q.trim().toLowerCase()
    const filtered = query
      ? opps.filter(o =>
          o.name.toLowerCase().includes(query) ||
          (accountName.get(o.account_id || '') || '').toLowerCase().includes(query) ||
          (codeByOpp[o.id] || '').toLowerCase().includes(query))
      : opps
    return filtered.slice(0, 100)
  }, [sf, q, accountName]) // eslint-disable-line react-hooks/exhaustive-deps

  const link = (id: string) => sf?.sf_instance_url ? `${sf.sf_instance_url.replace(/\/$/, '')}/lightning/r/Opportunity/${id}/view` : null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>
          {sfLoading ? 'Refreshing…' : sf ? `${sf.accounts.length} accounts · ${sf.opportunities.length} opportunities${sf.stale ? ' · stale' : ''}` : ''}
        </span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search account, opportunity, or code…"
          style={{ marginLeft: 'auto', minWidth: 260, border: '1px solid var(--gray-300)', borderRadius: 8, padding: '7px 12px', fontSize: 13, outline: 'none' }} />
      </div>
      <div style={{ border: '1px solid var(--gray-200)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', maxHeight: 440 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={th}>Account</th><th style={th}>Opportunity</th><th style={th}>Status</th><th style={th}>Project Code</th>
                <th style={th}>SF Link</th><th style={th}>Value</th><th style={th}>Close Date</th>
              </tr>
            </thead>
            <tbody>
              {sfLoading && <tr><td style={td} colSpan={7}>Loading Salesforce…</td></tr>}
              {!sfLoading && rows.length === 0 && <tr><td style={{ ...td, color: 'var(--gray-400)' }} colSpan={7}>No opportunities.</td></tr>}
              {!sfLoading && rows.map(o => {
                const status = o.is_closed ? (o.is_won ? 'Closed Won' : 'Closed Lost') : 'Open'
                const href = link(o.id)
                const code = codeByOpp[o.id]
                return (
                  <tr key={o.id}>
                    <td style={td}>{accountName.get(o.account_id || '') || '—'}</td>
                    <td style={td}>{o.name}</td>
                    <td style={td}>{o.stage || status}</td>
                    <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontWeight: code ? 600 : 400, color: code ? 'var(--gray-900)' : 'var(--gray-400)' }}>{code || '—'}</td>
                    <td style={td}>{href ? <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--orange, #d97800)' }}>Open ↗</a> : <span style={{ color: 'var(--gray-400)', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{o.id}</span>}</td>
                    <td style={td}>{money(o.amount)}</td>
                    <td style={td}>{fmtDate(o.close_date)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {sf && rows.length === 100 && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 8 }}>Showing first 100 — search to narrow.</div>}
    </div>
  )
}

// ── Generate view ─────────────────────────────────────────────────────────────
function GenerateView({ sf, sfLoading, sfError, reloadSf, onCreated }: {
  sf: SalesforceOptions | null; sfLoading: boolean; sfError: string | null
  reloadSf: (refresh?: boolean) => void; onCreated: () => void
}) {
  const [workType, setWorkType] = useState<WorkType>(null)
  const [team, setTeam] = useState<string | null>(null)
  const [internalProject, setInternalProject] = useState('')
  // Customer work: name text is the value (typed or picked); *SfId captured when picked.
  const [custName, setCustName] = useState('')
  const [custSfId, setCustSfId] = useState<string | null>(null)
  const [projName, setProjName] = useState('')
  const [projSfId, setProjSfId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [created, setCreated] = useState<(ProjectCode & { existing?: boolean }) | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { if (workType === 'customer' && !sf && !sfLoading) reloadSf(false) }, [workType]) // eslint-disable-line react-hooks/exhaustive-deps

  const accountOptions: ComboOption[] = useMemo(() => (sf?.accounts || []).map(a => ({ value: a.id, label: a.name })), [sf])
  const oppOptions: ComboOption[] = useMemo(() => {
    const opps = sf?.opportunities || []
    // Scope opportunity suggestions to the picked account, if any.
    const scoped = custSfId ? opps.filter(o => o.account_id === custSfId) : opps
    return scoped.map(o => ({ value: o.id, label: o.name, sub: [o.stage, o.is_closed ? null : 'Open'].filter(Boolean).join(' · ') || undefined }))
  }, [sf, custSfId])

  const customerName = workType === 'internal' ? null : (custName.trim() || null)
  const projectName = workType === 'internal' ? (internalProject.trim() || null) : (projName.trim() || null)

  // Enough entered to generate?
  const canGenerate = workType === 'internal' ? (!!team && !!internalProject.trim()) : !!custName.trim()

  async function generate() {
    if (!canGenerate) return
    setGenerating(true)
    try {
      const c = await api.createProjectCode({
        work_type: workType!, team: team || undefined,
        customer: customerName || undefined, project_name: projectName || undefined,
        sf_account_id: (workType === 'customer' ? custSfId : null) || undefined,
        sf_opp_id: (workType === 'customer' ? projSfId : null) || undefined,
      })
      setCreated(c)
      onCreated()
    } finally {
      setGenerating(false)
    }
  }

  function copy() {
    if (!created) return
    const text = created.code
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500) }
    const fallback = () => {
      try {
        const ta = document.createElement('textarea')
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
      } catch { /* ignore */ }
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => { fallback(); done() })
    } else { fallback(); done() }
  }


  const pill = (active: boolean) => ({
    flex: 1, padding: '14px 16px', borderRadius: 10, cursor: 'pointer', textAlign: 'center' as const,
    border: `1.5px solid ${active ? 'var(--orange, #FF9900)' : 'var(--gray-300)'}`,
    background: active ? 'rgba(255,153,0,0.08)' : '#fff',
    color: active ? 'var(--gray-900)' : 'var(--gray-700)', fontWeight: 600, fontSize: 14,
  })

  // Success screen — compact: the code + an icon copy button. If a code already
  // existed for this account+opportunity, show that instead of minting a new one.
  if (created) {
    const already = created.existing
    return (
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>Generate Project Code</div>
        <div style={{ borderBottom: '1px solid var(--gray-200)', margin: '10px 0 24px' }} />
        {already && (
          <div style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: 10, maxWidth: 460 }}>
            This account + opportunity already has a project code — a new one can’t be generated. Here it is:
          </div>
        )}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, padding: '12px 16px', border: `1px solid ${already ? 'var(--gray-300)' : '#cdebd6'}`, background: already ? 'var(--gray-100)' : '#f1faf4', borderRadius: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: already ? 'var(--gray-600)' : '#256a3a' }}>{already ? 'Existing code' : '✓ Success'}</span>
          <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'ui-monospace, monospace', color: 'var(--gray-900)', letterSpacing: 0.5 }}>{created.code}</span>
          <button onClick={copy} title={copied ? 'Copied' : 'Copy code'}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, border: '1px solid var(--gray-300)', background: '#fff', borderRadius: 8, cursor: 'pointer', color: copied ? '#256a3a' : 'var(--gray-600)', flexShrink: 0 }}>
            {copied ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            )}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>Generate Project Code</div>
      <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 2 }}>Create a new customer or internal project code.</div>
      <div style={{ borderBottom: '1px solid var(--gray-200)', margin: '10px 0 24px' }} />

      <Label>Is this customer work or internal Machina work?</Label>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <div style={pill(workType === 'customer')} onClick={() => setWorkType('customer')}>Customer work</div>
        <div style={pill(workType === 'internal')} onClick={() => setWorkType('internal')}>Internal Machina work</div>
      </div>

      {workType === 'internal' && (
        <div style={{ marginBottom: 24 }}>
          <Label>Which internal team is it for?</Label>
          <Combo options={INTERNAL_TEAMS.map(t => ({ value: t, label: t }))} value={team} onChange={setTeam} placeholder="Select a team…" />
          <div style={{ marginTop: 18 }}>
            <Label>Project Name</Label>
            <input value={internalProject} onChange={e => setInternalProject(e.target.value)} placeholder="e.g. Cell throughput rig"
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--gray-300)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none' }} />
          </div>
        </div>
      )}

      {workType === 'customer' && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
              {sfLoading ? 'Loading Salesforce lists…' : sf ? `Salesforce · ${sf.accounts.length} accounts · ${sf.opportunities.length} opportunities${sf.stale ? ' · stale' : ''}` : ''}
            </div>
            <button onClick={() => reloadSf(true)} disabled={sfLoading}
              style={{ fontSize: 12, fontWeight: 600, border: '1px solid var(--gray-300)', background: '#fff', borderRadius: 6, padding: '3px 10px', cursor: sfLoading ? 'default' : 'pointer', color: 'var(--gray-700)' }}>
              {sfLoading ? '…' : 'Refresh'}
            </button>
          </div>
          {sfError && <div style={{ padding: '10px 12px', background: '#fdf0f0', border: '1px solid #f3c9c9', borderRadius: 8, color: '#a13b3b', fontSize: 13, marginBottom: 16 }}>Couldn’t load Salesforce lists: {sfError}</div>}
          <div style={{ marginBottom: 18 }}>
            <Label>Customer Name <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(search Salesforce, or type a new one)</span></Label>
            <AutoInput
              value={custName}
              onChangeText={t => { setCustName(t); setCustSfId(null); setProjSfId(null) }}
              onPick={o => { setCustName(o.label); setCustSfId(o.value); setProjName(''); setProjSfId(null) }}
              options={accountOptions}
              placeholder={sf ? 'Search or type a customer…' : 'Loading…'}
              disabled={!sf}
            />
          </div>
          <div>
            <Label>Project Name <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(search Salesforce, or type a new one)</span></Label>
            <AutoInput
              value={projName}
              onChangeText={t => { setProjName(t); setProjSfId(null) }}
              onPick={o => { setProjName(o.label); setProjSfId(o.value) }}
              options={oppOptions}
              placeholder={sf ? 'Search or type a project…' : 'Loading…'}
              disabled={!sf}
            />
          </div>
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <button onClick={generate} disabled={!canGenerate || generating}
          style={{
            fontSize: 14, fontWeight: 600, border: 'none', borderRadius: 8, padding: '11px 26px',
            background: !canGenerate || generating ? 'var(--gray-200)' : 'var(--orange, #FF9900)',
            color: !canGenerate || generating ? 'var(--gray-500)' : '#fff',
            cursor: !canGenerate || generating ? 'not-allowed' : 'pointer',
          }}>
          {generating ? 'Generating…' : 'Generate'}
        </button>
      </div>
    </div>
  )
}

// ── Tab shell ─────────────────────────────────────────────────────────────────
export default function ProjectCodeTab() {
  const [view, setView] = useState<'list' | 'generate'>('list')
  const [sf, setSf] = useState<SalesforceOptions | null>(null)
  const [sfLoading, setSfLoading] = useState(false)
  const [sfError, setSfError] = useState<string | null>(null)
  const [listNonce, setListNonce] = useState(0)

  async function loadSf(refresh = false) {
    setSfLoading(true); setSfError(null)
    try {
      setSf(await api.getSalesforceOptions(refresh))
    } catch (e) {
      setSfError(e instanceof Error ? e.message : 'Failed to load Salesforce lists')
    } finally {
      setSfLoading(false)
    }
  }

  // Salesforce list loads in the background (needed by the SF reference list + Generate).
  useEffect(() => { loadSf(false) }, [])

  const tab = (key: 'list' | 'generate', label: string) => (
    <button onClick={() => setView(key)} style={{
      flex: 1, padding: '11px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
      border: `1px solid ${view === key ? 'var(--orange, #FF9900)' : 'var(--gray-300)'}`,
      background: view === key ? 'var(--orange, #FF9900)' : '#fff',
      color: view === key ? '#fff' : 'var(--gray-700)',
    }}>{label}</button>
  )

  return (
    <div className="home-page" style={{ maxWidth: 920 }}>
      <div className="home-header" style={{ marginBottom: 4 }}>
        <div>
          <div className="home-title">Project Code</div>
          <div className="home-subtitle">Track and generate project codes.</div>
        </div>
      </div>
      <div style={{ borderBottom: '1px solid var(--gray-200)', margin: '12px 0 20px' }} />

      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        {tab('list', 'List')}
        {tab('generate', 'Generate')}
      </div>

      {view === 'list'
        ? <ListView key={listNonce} sf={sf} sfLoading={sfLoading} reloadSf={loadSf} />
        : <GenerateView sf={sf} sfLoading={sfLoading} sfError={sfError} reloadSf={loadSf} onCreated={() => setListNonce(n => n + 1)} />}
    </div>
  )
}

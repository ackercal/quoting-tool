import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '../api/client'
import type { Project, Constant } from '../types'

type Section = 'projects' | 'devtools' | 'readme' | 'helpers'

const YEARS = [2026, 2027, 2028]

function fmtVal(v: number) {
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(4)
}

// Split "pre_if_RPE_2026" → { base: "pre_if_RPE", year: 2026 }
// or "rate_RPE"           → { base: "rate_RPE",   year: null }
function parseKey(key: string): { base: string; year: number | null } {
  const m = key.match(/^(.+)_(2026|2027|2028)$/)
  return m ? { base: m[1], year: parseInt(m[2]) } : { base: key, year: null }
}

// Human-readable label for a base key
const BASE_LABELS: Record<string, string> = {
  pre_if_RPE:  'Pre-IF Forming · RPE',
  pre_if_ME:   'Pre-IF Forming · ME',
  pre_if_Tech: 'Pre-IF Forming · Tech',
  if_RPE:      'IF Forming · RPE',
  if_ME:       'IF Forming · ME',
  if_Tech:     'IF Forming · Tech',
  dup_RPE:     'Duplicate Forming · RPE',
  dup_ME:      'Duplicate Forming · ME',
  dup_Tech:    'Duplicate Forming · Tech',
  scan_RPE:    'Scanning · RPE',
  scan_ME:     'Scanning · ME',
  scan_Tech:   'Scanning · Tech',
  cut_RPE:     'Cutting · RPE',
  cut_ME:      'Cutting · ME',
  cut_Tech:    'Cutting · Tech',
  unistrut_Tech: 'Unistrut · Tech',
}

function label(base: string) {
  return BASE_LABELS[base] ?? base
}

interface YearGrid { base: string; desc: string; values: Record<number, number | undefined> }

function buildYearGrid(constants: Constant[]): YearGrid[] {
  const map = new Map<string, YearGrid>()
  for (const c of constants) {
    const { base, year } = parseKey(c.key)
    if (year === null) continue
    if (!map.has(base)) map.set(base, { base, desc: c.description ?? '', values: {} })
    map.get(base)!.values[year] = c.value
  }
  return Array.from(map.values())
}

function flatConstants(constants: Constant[]) {
  return constants.filter(c => parseKey(c.key).year === null)
}

function CalcField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="field-dollar">
        <input type="number" min="0" step="0.01" value={value} onChange={e => onChange(e.target.value)} />
      </div>
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  )
}

// Material properties: density (g/cm³) and cost ($/kg)
// Update these values to match current supplier pricing
const MATERIAL_PROPS: Record<string, { density: number; costPerKg: number }> = {
  'AA-6061-0':       { density: 2.70, costPerKg: 3.50 },
  'AA-5052-0':       { density: 2.68, costPerKg: 4.00 },
  'AA-7075-0':       { density: 2.80, costPerKg: 6.00 },
  'Ti-6Al-4V sheet': { density: 4.43, costPerKg: 50.00 },
}
const MATERIAL_TYPES_LIST = Object.keys(MATERIAL_PROPS)

// Full frame sheet dimensions in mm — update to match your forming frame
const FRAME_WIDTH_MM  = 1200
const FRAME_HEIGHT_MM = 1200

function SheetCostCalculator() {
  return (
    <div style={{ marginBottom: 32 }}>
      <div className="section-heading" style={{ marginTop: 0, fontSize: 22 }}>Sheet Cost Calculator</div>
      <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 16, lineHeight: 1.6 }}>
        The best way to estimate sheet cost is to look it up directly on{' '}
        <a href="https://www.ryerson.com/store/cart/" target="_blank" rel="noreferrer" style={{ color: 'var(--orange)', textDecoration: 'underline' }}>ryerson.com</a>.
        Search for a sheet that is <strong>144 × 60 inches</strong> in whatever thickness and alloy you need,
        then set the order quantity to <strong>10 sheets</strong> to get a representative per-sheet price — unless it is a small part with a low order quantity, in which case adjust accordingly.
      </p>
    </div>
  )
}

const S: React.CSSProperties = { fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.7 }
const SH: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--gray-700)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, marginTop: 20 }
const ROW = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
    <span style={{ ...S, fontWeight: 600, minWidth: 180 }}>{label}</span>
    <span style={S}>{value}</span>
  </div>
)

function HTCostCalculator() {
  return (
    <div style={{ marginBottom: 32 }}>
      <div className="section-heading" style={{ marginTop: 0, fontSize: 22 }}>HT Cost Context</div>

      <p style={S}>
        To figure out your cost, your goal is to figure out how many of your parts you can fit in the necessary oven.
        The salespeople at these suppliers will do the final calculation of what can fit, but if you want to get a close
        estimate by hand, the following information will allow this.
      </p>

      <p style={{ ...S, marginTop: 12 }}>
        <strong>Two notes on HT:</strong> Parts can nest but with at least 6" between any two points.
        Unistruts can interfere with your ability to nest.
      </p>

      {/* Solar Atmosphere */}
      <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--gray-200)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-700)' }}>Solar Atmosphere</span>
          <a href="https://solaratm.com/" target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--orange)', textDecoration: 'underline' }}>solaratm.com</a>
        </div>
        <p style={S}>
          For materials sensitive to oxidation or other surface reactions at high temperatures, we send them here for vacuum heat treatment.
        </p>
        <p style={{ ...S, marginTop: 4 }}>
          <strong>Relevant materials:</strong> most steels (stainless, carbon, tool, etc.), Invar, titanium, superalloys (e.g. Inconel)
        </p>

        <div style={SH}>Larger Oven</div>
        <ROW label="Dimensions" value='60" × 60" × 288" L' />
        <ROW label="Spacing" value='6" apart when stacked' />
        <ROW label="Cost per run" value="$3,250 + $125/each + 7% energy surcharge" />
        <ROW label="Typical capacity" value="Up to 9 large parts (even if 12 would fit)" />

        <div style={SH}>Smaller Oven</div>
        <ROW label="Dimensions" value='54" × 54" × 144" L' />
        <ROW label="Spacing" value='6" apart when stacked' />
        <ROW label="Cost per run" value="$2,100 + $125/each + 7% energy surcharge (min. $2,225)" />

        <div style={SH}>Shipping & Lead Time</div>
        <ROW label="Lead time" value="8–10 days on PO (typically comes back sooner)" />
        <ROW label="Shipping" value="$200 each way ($400 total)" />
        <ROW label="Expedite — 5 business days" value="50% fee" />
        <ROW label="Expedite — 4 business days" value="100% fee" />
        <ROW label="Expedite — 3 business days" value="150% fee" />
      </div>

      {/* Newton Heat Treating */}
      <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--gray-200)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-700)' }}>Newton Heat Treating</span>
          <a href="https://www.newtonheattreating.com/" target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--orange)', textDecoration: 'underline' }}>newtonheattreating.com</a>
        </div>
        <p style={S}>
          For other materials we send them here for traditional heat treatment.
        </p>
        <p style={{ ...S, marginTop: 4 }}>
          <strong>Relevant materials:</strong> mostly aluminum
        </p>

        <div style={SH}>Oven</div>
        <ROW label="Dimensions" value='78" × 80" × 173.5"' />
        <ROW label="Cost per run" value="$505.30 + 10% environmental fee" />
        <ROW label="Typical capacity" value="4–6 parts depending on geometry" />

        <div style={SH}>Shipping & Lead Time</div>
        <ROW label="Lead time" value="8–10 days on PO (typically comes back sooner)" />
        <ROW label="Shipping" value="$200 per PO" />
        <ROW label="Expedite" value="$650" />
      </div>
    </div>
  )
}

export default function Home() {
  type Filter = 'all' | 'active' | 'inactive'
  const location = useLocation()
  const initialSection = (): Section => {
    const s = new URLSearchParams(location.search).get('section')
    if (s === 'helpers' || s === 'devtools' || s === 'readme') return s
    return 'projects'
  }
  const [section, setSection]   = useState<Section>(initialSection)
  const [projects, setProjects] = useState<Project[]>([])
  const [constants, setConstants] = useState<Constant[]>([])
  const [laborSets, setLaborSets] = useState<{
    labor_sets: Record<string, Record<string, Record<number, Record<string, number>>>>;
    part_sets: Record<string, Record<string, unknown>>;
    project_hours: Record<string, Record<number, number>>;
    robot_improvement: Record<string, Record<number, number>>;
    trial_reduction: Record<number, number>;
  } | null>(null)
  const [loading, setLoading]   = useState(true)
  const [showNew, setShowNew]   = useState(false)
  const [newName, setNewName]   = useState('')
  const [creating, setCreating] = useState(false)
  const [filter, setFilter]     = useState<Filter>('active')
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([api.listProjects(), api.listConstants(), api.getLaborSets()])
      .then(([p, c, ls]) => { setProjects(p); setConstants(c); setLaborSets(ls) })
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const proj = await api.createProject({ name: newName.trim() })
      navigate(`/projects/${proj.id}`)
    } finally {
      setCreating(false)
    }
  }

  function fmt(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }


  return (
    <div className="app-layout">
      {/* ── Sidebar ── */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">Machina Quote Tool</div>
        </div>
        <nav className="sidebar-nav">
          <div
            className={`sidebar-item${section === 'projects' ? ' active' : ''}`}
            onClick={() => setSection('projects')}
          >
            <svg className="sidebar-item-icon" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
            Projects
          </div>
          <div
            className={`sidebar-item${section === 'devtools' ? ' active' : ''}`}
            onClick={() => setSection('devtools')}
          >
            <svg className="sidebar-item-icon" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            Process Constants
          </div>
          <div
            className={`sidebar-item${section === 'helpers' ? ' active' : ''}`}
            onClick={() => setSection('helpers')}
          >
            <svg className="sidebar-item-icon" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 2a7 7 0 100 14A7 7 0 009 2zm0 11v-1m0-3a1 1 0 01-1-1V7a1 1 0 012 0v2a1 1 0 01-1 1z" />
            </svg>
            Estimation Context
          </div>
          <div className="sidebar-divider" style={{ marginTop: 'auto' }} />
          <div
            className={`sidebar-item${section === 'readme' ? ' active' : ''}`}
            onClick={() => setSection('readme')}
          >
            <svg className="sidebar-item-icon" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 4H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M13 4h4v4M10 10l7-7" />
            </svg>
            Read Me
          </div>
        </nav>
      </div>

      {/* ── Main ── */}
      <div className="main-content">
        {section === 'projects' && (
          <div className="home-page">
            <div className="home-header">
              <div>
                <div className="home-title">Projects</div>
                <div className="home-subtitle">Select a project or create a new one</div>
              </div>
              <button className="btn-primary" onClick={() => setShowNew(true)}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                New Project
              </button>
            </div>

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
              {(['active', 'inactive', 'all'] as Filter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: '6px 14px', borderRadius: 6, border: '1px solid',
                    fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    borderColor: filter === f ? 'var(--orange)' : 'var(--gray-200)',
                    background: filter === f ? 'var(--orange)' : 'var(--white)',
                    color: filter === f ? '#fff' : 'var(--gray-600)',
                  }}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {loading && <div className="loading">Loading…</div>}

            {!loading && (() => {
              const visible = projects.filter(p =>
                filter === 'all' ? true :
                filter === 'active' ? p.is_active !== 0 :
                p.is_active === 0
              )
              if (visible.length === 0) return (
                <div className="empty-state">
                  <div className="empty-state-icon">📋</div>
                  <div className="empty-state-title">{projects.length === 0 ? 'No quotes yet' : `No ${filter} projects`}</div>
                  <div>{projects.length === 0 ? 'Create your first project to get started.' : 'Switch the filter to see other projects.'}</div>
                </div>
              )
              return (
                <div className="project-grid">
                  {visible.map(p => (
                    <div key={p.id} className="project-card" onClick={() => navigate(`/projects/${p.id}`)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                        <div className="project-card-name" style={{ marginBottom: 0 }}>{p.name}</div>
                        {p.is_active === 0 && (
                          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--gray-400)', background: 'var(--gray-100)', borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>Inactive</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
                        {[
                          ['Assemblies', p.quantity_of_assemblies],
                          ['Unique Parts', p.parts_count ?? 0],
                          ['Total Price', p.quoted_price != null ? p.quoted_price.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '—'],
                        ].map(([label, value]) => (
                          <div key={String(label)}>
                            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--gray-400)', marginBottom: 2 }}>{label}</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-700)' }}>{value}</div>
                          </div>
                        ))}
                      </div>
                      <div className="project-card-meta">
                        <span>Updated {fmt(p.updated_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        )}

        {section === 'devtools' && (
          <div className="home-page">
            <div className="home-header">
              <div>
                <div className="home-title">Process Constants</div>
                <div className="home-subtitle">Read-only view of stored data</div>
              </div>
            </div>

            {/* Projects table */}
            <div className="section-heading" style={{ marginTop: 0 }}>All Projects</div>
            {loading && <div className="loading">Loading…</div>}
            {!loading && (
              <div className="quote-section" style={{ marginBottom: 32 }}>
                <table className="quote-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Assemblies</th>
                      <th>Margin</th>
                      <th>Year</th>
                      <th>Created</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.length === 0 && (
                      <tr><td colSpan={7} style={{ color: 'var(--gray-400)', textAlign: 'center' }}>No projects yet</td></tr>
                    )}
                    {projects.map(p => (
                      <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${p.id}`)}>
                        <td style={{ color: 'var(--gray-400)', fontFamily: 'monospace' }}>{p.id}</td>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td>{p.quantity_of_assemblies}</td>
                        <td>{(p.internal_margin * 100).toFixed(0)}%</td>
                        <td>{p.year_of_execution}</td>
                        <td>{fmt(p.created_at)}</td>
                        <td>{fmt(p.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Constants Database */}
            <div className="section-heading">Constants Database</div>
            {!loading && laborSets && (() => {
              const flat  = flatConstants(constants)
              const getC  = (key: string)                => constants.find(c => c.key === key)?.value ?? 0

              const OPS = ['pre_if_forming', 'if_forming', 'dup_forming', 'first_scan', 'dup_scan', 'first_cut', 'dup_cut']
              const OP_LABELS: Record<string, string> = {
                pre_if_forming: 'Forming — Pre-IF',
                if_forming:     'Forming — IF',
                dup_forming:    'Forming — Duplicate',
                first_scan:     'Scanning — First',
                dup_scan:       'Scanning — Duplicate',
                first_cut:      'Cutting — First',
                dup_cut:        'Cutting — Duplicate',
              }
              const ROLES = ['RPE', 'ME', 'Tech']
              const SET_LABELS: Record<string, string> = { formed_parts: 'Formed Parts', custom_auto: 'Custom Auto' }

              const divider = (label: string) => (
                <tr key={label}>
                  <td colSpan={2 + YEARS.length} style={{ background: 'var(--gray-100)', fontSize: 10, fontWeight: 700, color: 'var(--gray-400)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '6px 16px' }}>
                    {label}
                  </td>
                </tr>
              )

              return (
                <>
                  {Object.entries(laborSets.labor_sets ?? laborSets).map(([setKey, setData]) => {
                    const ph = ((laborSets.part_sets ?? {})[setKey] ?? {}) as Record<string, unknown>
                    const getPhYear = (key: string, yr: number): number => {
                      const v = ph[key]
                      if (v && typeof v === 'object') return (v as Record<string, number>)[String(yr)] ?? 0
                      return 0
                    }
                    const getPhFixed = (key: string): number => {
                      const v = ph[key]
                      return typeof v === 'number' ? v : 0
                    }

                    return (
                      <div key={setKey} style={{ marginBottom: 28 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-400)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                          {SET_LABELS[setKey] ?? setKey}
                        </div>
                        <div className="quote-section">
                          <table className="quote-table">
                            <thead>
                              <tr>
                                <th>Item</th>
                                <th>Role</th>
                                {YEARS.map(y => <th key={y} className="right">{y}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {/* Operation Level */}
                              {divider('Operation Level')}
                              {OPS.flatMap(op => ROLES.map(role => (
                                <tr key={`${op}-${role}`}>
                                  <td style={{ color: role !== 'RPE' ? 'transparent' : undefined }}>{role === 'RPE' ? (OP_LABELS[op] ?? op) : ''}</td>
                                  <td style={{ color: 'var(--gray-400)', fontSize: 12 }}>{role}</td>
                                  {YEARS.map(y => (
                                    <td key={y} className="right" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                      {fmtVal((setData[op]?.[y] as Record<string, number>)?.[role] ?? 0)}
                                    </td>
                                  ))}
                                </tr>
                              )))}
                              {(['forming', 'scanning', 'cutting'] as const).map(cat => (
                                <tr key={`robot_${cat}`}>
                                  <td style={{ color: cat !== 'forming' ? 'transparent' : undefined }}>
                                    {cat === 'forming' ? 'Robot Time Improvement' : ''}
                                  </td>
                                  <td style={{ color: 'var(--gray-400)', fontSize: 12 }}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</td>
                                  {YEARS.map(y => (
                                    <td key={y} className="right" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                      {fmtVal(laborSets.robot_improvement?.[cat]?.[y] ?? 1)}
                                    </td>
                                  ))}
                                </tr>
                              ))}

                              {/* Part Level */}
                              {divider('Part Level')}
                              {([
                                { label: 'Prep for Shipping', role: 'Tech',     key: 'palletize_tech', scope: 'Every part' },
                                { label: 'Unistrut',          role: 'Tech',     key: 'unistrut_tech',  scope: 'Every part' },
                              ] as { label: string; role: string; key: string; scope: string }[]).map(row => (
                                <tr key={row.key}>
                                  <td>{row.label} <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 400 }}>— {row.scope}</span></td>
                                  <td style={{ color: 'var(--gray-400)', fontSize: 12 }}>{row.role}</td>
                                  {YEARS.map(y => <td key={y} className="right" style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmtVal(getPhYear(row.key, y))}</td>)}
                                </tr>
                              ))}
                              {([
                                { label: 'Purchaser Setup',    role: 'Purchaser', key: 'purchaser_setup',    scope: 'First part only' },
                                { label: 'PM Setup',           role: 'PM',        key: 'pm_setup',           scope: 'First part only' },
                                { label: 'Purchaser Overhead', role: 'Purchaser', key: 'purchaser_overhead', scope: 'Every part' },
                                { label: 'PM Overhead',        role: 'PM',        key: 'pm_overhead',        scope: 'Every part' },
                              ] as { label: string; role: string; key: string; scope: string }[]).map(row => (
                                <tr key={row.key}>
                                  <td>{row.label} <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 400 }}>— {row.scope}</span></td>
                                  <td style={{ color: 'var(--gray-400)', fontSize: 12 }}>{row.role}</td>
                                  {YEARS.map(y => <td key={y} className="right" style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmtVal(getPhFixed(row.key))}</td>)}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })}

                  {/* Project Level — global, not set-specific */}
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-400)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                      Project Level
                    </div>
                    <div className="quote-section">
                      <table className="quote-table">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Role</th>
                            {YEARS.map(y => <th key={y} className="right">{y}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {divider('Project Level — First assembly only')}
                          {([
                            { label: 'Purchaser Overhead', role: 'Purchaser', key: 'purchaser' },
                            { label: 'PM Overhead',        role: 'PM',        key: 'pm' },
                          ] as { label: string; role: string; key: string }[]).map(row => (
                            <tr key={row.key}>
                              <td>{row.label}</td>
                              <td style={{ color: 'var(--gray-400)', fontSize: 12 }}>{row.role}</td>
                              {YEARS.map(y => (
                                <td key={y} className="right" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                  {fmtVal(laborSets.project_hours?.[row.key]?.[y] ?? 0)}
                                </td>
                              ))}
                            </tr>
                          ))}
                          <tr>
                            <td>Trial Reduction <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 400 }}>— Pre-IF &amp; IF procedures × factor, rounded up</span></td>
                            <td style={{ color: 'var(--gray-400)', fontSize: 12 }}>multiplier</td>
                            {YEARS.map(y => (
                              <td key={y} className="right" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                {fmtVal(laborSets.trial_reduction?.[y] ?? 1)}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Hourly Rates — global, not set-specific */}
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-400)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                      Hourly Rates
                    </div>
                    <div className="quote-section">
                      <table className="quote-table">
                        <thead><tr><th>Role / Cell</th><th className="right">$/hr</th></tr></thead>
                        <tbody>
                          {flat.filter(c => c.key.startsWith('rate_')).map(c => {
                            const isRobot = ['rate_Small', 'rate_Medium', 'rate_Large'].includes(c.key)
                            return (
                              <tr key={c.key}>
                                <td>{c.description ?? c.key}</td>
                                <td className="right" style={isRobot ? { fontFamily: 'monospace', fontWeight: 600 } : { color: 'var(--gray-400)', fontStyle: 'italic' }}>
                                  {isRobot ? fmtVal(c.value) : 'private'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        )}

        {section === 'readme' && (
          <div className="home-page" style={{ maxWidth: 740 }}>
            <div className="home-header" style={{ marginBottom: 8 }}>
              <div>
                <div className="home-title">How Quoting Works</div>
                <div className="home-subtitle">A plain-language overview of the math behind every quote</div>
              </div>
            </div>

            {/* ── This Tool and Its Future ── */}
            <div style={{ marginBottom: 36 }}>
              <div className="section-heading" style={{ marginTop: 0, marginBottom: 6, fontSize: 16 }}>This Tool and Its Future</div>
              <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.75 }}>
                This tool is built around two inputs that mirror the way we internally talk about the difficulty of making a part: <strong>how long the robot will run</strong> and <strong>how many trials it will take</strong> to reach the customer's requirements. The hard part about using this tool well is getting an accurate run time estimate.
              </p>
              <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.75, marginTop: 12 }}>
                We will support you in this going forward. The first step is putting an accurate run time estimator into Architect — shortening the path from a skirted part to a reliable run time estimate. After that we will ship an improved auto-skirter so you can go all the way from a metric surface to a run time with minimal manual work. Eventually we may look at providing an estimator based only on the metric surface geometry.
              </p>
              <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.75, marginTop: 12 }}>
                The reason we are doing it in this order is that the forming settings an RPE chooses — things like layer height — can have an enormous impact on run time. Estimating directly from surface area or other simplified geometry assumptions doesn't work reliably given how much those choices matter.
              </p>
            </div>

            {/* ── First Part vs Duplicate ── */}
            <div style={{ marginBottom: 36 }}>
              <div className="section-heading" style={{ marginTop: 0, marginBottom: 6, fontSize: 16 }}>First Part vs Duplicate</div>
              <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.75 }}>
                One of the most important things this tool does is separate the cost of making the <strong>first deliverable part</strong> from the cost of <strong>duplicating it</strong>. This reflects a real pattern in how we work: it takes time and material to find the right recipe for a part, but once we have it the robots are repeatable and can duplicate their results with minimal human involvement.
              </p>
              <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.75, marginTop: 12 }}>
                We only stop IF trials when we have the recipe we want to duplicate — which means the last IF run <em>is</em> the first deliverable part. Take a customer who wants 5 parts and where you expect 5 pre-IF and 5 IF trials: you'd need to form <strong>14 sheets of metal</strong>. After 10 trial procedures you have made one finished part. You then duplicate that 4 more times. All 10 trial procedures are priced into the "first part" cost; the remaining 4 are priced as duplicates.
              </p>
            </div>

            {/* ── How This Tool Works ── */}
            <div style={{ marginBottom: 36 }}>
              <div className="section-heading" style={{ marginTop: 0, marginBottom: 6, fontSize: 16 }}>How This Tool Works</div>
              <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.75 }}>
                This is a <strong>cost-plus tool</strong>. We estimate our costs and add a margin to arrive at a price. Costs are broken into three buckets: <strong>labor</strong>, <strong>robot time</strong>, and <strong>parts and other</strong>.
              </p>
              <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.75, marginTop: 12 }}>
                You provide the robot hours. For labor, we have hard-coded the number of hours each role — RPE, ME, and Technician — is involved at each step, based on estimates from team managers and product. For example, a pre-IF forming procedure currently carries <strong>2 hrs of RPE time, 1 hr of ME time, and 1.5 hrs of Technician time</strong> per sheet of metal run. Those hours are multiplied by each role's hourly rate to get the labor cost for that procedure.
              </p>
              <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.75, marginTop: 12 }}>
                There are also overhead labor costs that aren't tied to a single procedure — things like Project Manager coordination, Purchaser sourcing, and unistrut fixturing setup. These are added on top of the per-procedure costs.
              </p>
            </div>

            {/* ── Improvement ── */}
            <div style={{ marginBottom: 36 }}>
              <div className="section-heading" style={{ marginTop: 0, marginBottom: 6, fontSize: 16 }}>Improvement Over Time</div>
              <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.75 }}>
                To capture our expected product improvements in pricing, we have estimates for how much labor per person will decrease year-over-year and how much faster the robots will form. These factors are applied automatically when you select a future year of execution. The underlying values are visible in the <strong>Dev Tools</strong> tab. Labor reductions come from better tooling that removes manual steps or speeds up each person's process.
              </p>
            </div>

            {/* ── Margin ── */}
            <div style={{ marginBottom: 36 }}>
              <div className="section-heading" style={{ marginTop: 0, marginBottom: 6, fontSize: 16 }}>Margin</div>
              <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.75 }}>
                We draw a distinction between <strong>internal work</strong> and <strong>outside service providers (OSP)</strong>. We typically charge a <strong>70% margin</strong> on our own labor and robot time. For work done by someone else — heat treatment, external post-processing, purchased parts — we charge a <strong>10% margin</strong>, which covers our coordination effort. The tool applies these separately so the blended margin reflects the actual mix of internal and external costs on each project.
              </p>
            </div>

            <div style={{ borderBottom: '1px solid var(--gray-200)', margin: '8px 0 36px' }} />

            {/* ── Kept reference sections ── */}
            {[
              {
                heading: 'Robot Types (Small / Medium / Large)',
                body: `The robot cell used for forming has its own hourly cost, which varies by size — a Large robot costs significantly more per hour than a Small one. This rate is applied to the effective robot hours (after the improvement factor) for every forming, scanning, and cutting operation across all trials and the production run. Current rates: Small $24.42/hr, Medium $37.57/hr, Large $55.07/hr.`,
              },
              {
                heading: 'Sheet Material Cost',
                body: `Each trial and each production run consumes a sheet of raw material. You enter the cost per full frame sheet and how many parts fit per sheet — the tool divides to get the material cost per part per procedure. Sheet cost is included in every trial procedure and in the duplicate production run.`,
              },
              {
                heading: 'Heat Treatment and Post-Processing',
                body: `HT cost per part covers the heat treatment cycle. Post-processing captures any manual finishing work — sanding, welding, quality checks, and similar operations. These are split into internal labor and external vendor (OSP) costs. The first part carries an additional setup charge. All post-processing costs are added on top of robot and labor costs.`,
              },
              {
                heading: 'Unistrut Fixturing',
                body: `Some parts require a unistrut fixture to hold the sheet during forming. When the unistrut toggle is on, the tool adds Technician time for building and setting up the fixture. That time decreases year-over-year as fixturing becomes more standardized.`,
              },
              {
                heading: 'Fixed Overhead Per Part',
                body: `Every part carries a small fixed overhead regardless of complexity: Purchaser time to source materials and manage suppliers, and Project Manager time to coordinate the work. Both roles contribute a setup charge on the first part and a smaller recurring overhead on every duplicate.`,
              },
              {
                heading: 'Project-Level Costs',
                body: `On top of per-part costs, the project carries its own overhead. RPE time for splitting and DFM analysis (turning a full CAD model into individual formable surfaces) is a one-time charge on the first assembly. Assembly-level post-processing — welding, final QC, integration work — is charged on every assembly.`,
              },
            ].map(({ heading, body }) => (
              <div key={heading} style={{ marginBottom: 28 }}>
                <div className="section-heading" style={{ marginTop: 0, marginBottom: 6 }}>{heading}</div>
                <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.7 }}>{body}</p>
              </div>
            ))}
          </div>
        )}

        {section === 'helpers' && (
          <div className="home-page" style={{ maxWidth: 640 }}>
            <div className="home-header" style={{ marginBottom: 4 }}>
              <div>
                <div className="home-title">Estimation Context</div>
                <div className="home-subtitle">Information useful to estimating the costs associated with our process.</div>
              </div>
            </div>
            <div style={{ borderBottom: '1px solid var(--gray-200)', marginBottom: 40 }} />

            <SheetCostCalculator />
            <div style={{ borderBottom: '1px solid var(--gray-200)', margin: '32px 0 40px' }} />
            <HTCostCalculator />
          </div>
        )}
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Project</div>
            <div className="field">
              <label>Project Name <span className="required">*</span></label>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="e.g. JASSM Fuel Tank"
              />
            </div>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleCreate} disabled={creating || !newName.trim()}>
                {creating ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

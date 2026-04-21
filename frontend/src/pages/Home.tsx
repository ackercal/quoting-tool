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
  const [loading, setLoading]   = useState(true)
  const [showNew, setShowNew]   = useState(false)
  const [newName, setNewName]   = useState('')
  const [creating, setCreating] = useState(false)
  const [filter, setFilter]     = useState<Filter>('active')
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([api.listProjects(), api.listConstants()])
      .then(([p, c]) => { setProjects(p); setConstants(c) })
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
            className={`sidebar-item${section === 'helpers' ? ' active' : ''}`}
            onClick={() => setSection('helpers')}
          >
            <svg className="sidebar-item-icon" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 2a7 7 0 100 14A7 7 0 009 2zm0 11v-1m0-3a1 1 0 01-1-1V7a1 1 0 012 0v2a1 1 0 01-1 1z" />
            </svg>
            Estimation Context
          </div>
          <div
            className={`sidebar-item${section === 'readme' ? ' active' : ''}`}
            onClick={() => setSection('readme')}
          >
            <svg className="sidebar-item-icon" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 4H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M13 4h4v4M10 10l7-7" />
            </svg>
            Read Me
          </div>
          <div className="sidebar-divider" style={{ marginTop: 'auto' }} />
          <div
            className={`sidebar-item${section === 'devtools' ? ' active' : ''}`}
            onClick={() => setSection('devtools')}
          >
            <svg className="sidebar-item-icon" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            Dev Tools
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
                <div className="home-title">Dev Tools</div>
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
            {!loading && (() => {
              const yearGrid = buildYearGrid(constants)
              const flat     = flatConstants(constants)
              return (
                <>
                  {/* Year-keyed grid (labor hours) */}
                  {yearGrid.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-400)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                        Labor Hours Per Operation
                      </div>
                      <div className="quote-section">
                        <table className="quote-table">
                          <thead>
                            <tr>
                              <th>Operation · Role</th>
                              {YEARS.map(y => <th key={y} className="right">{y}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {yearGrid.map(row => (
                              <tr key={row.base}>
                                <td>{label(row.base)}</td>
                                {YEARS.map(y => (
                                  <td key={y} className="right" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                    {row.values[y] !== undefined ? fmtVal(row.values[y]!) : '—'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Flat constants (rates + misc without years) */}
                  {flat.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-400)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                        Hourly Rates &amp; Fixed Overhead
                      </div>
                      <div className="quote-section">
                        <table className="quote-table">
                          <thead>
                            <tr>
                              <th>Description</th>
                              <th className="right">Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {flat.map(c => (
                              <tr key={c.key}>
                                <td>{c.description ?? c.key}</td>
                                <td className="right" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                  {fmtVal(c.value)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
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

            {[
              {
                heading: 'Two types of parts: First Part and Duplicate',
                body: `Every part in an assembly is costed twice. The first time a part is made it carries all the setup and development work — forming trials, programming, skirt/path planning, and first-article inspection. Every subsequent copy of that same part (a duplicate) skips all of that and only carries the production cost. When you enter a quantity of, say, 3 assemblies, the tool prices the first assembly using first-part cost for each unique part, and the remaining 2 assemblies at duplicate cost.`,
              },
              {
                heading: 'Forming trials (Pre-IF and IF)',
                body: `Before a production-quality part is achieved, the robot runs a series of forming trials. Pre-IF trials are the initial exploratory runs before the part geometry is dialled in. IF (Incremental Forming) trials are the iterative tolerancing passes that bring the part within spec. Each trial consumes robot time, human labour (RPE, ME, and Technician), and a sheet of raw material. The number of each trial type is an input — a judgement call based on part complexity.`,
              },
              {
                heading: 'Robot time and the improvement factor',
                body: `Forming, scanning, and cutting each have a robot time input measured in hours. You enter the current baseline estimate (what the job takes today in 2026). For future years the tool automatically applies an improvement factor — 65% of the 2026 time in 2027, and 42.25% in 2028 — reflecting expected gains in robot speed and process maturity. This factor is applied to every operation that uses robot time.`,
              },
              {
                heading: 'Labour rates by role',
                body: `Each operation has a fixed number of labour hours per role: RPE (Robotic Process Engineer), ME (Mechanical Engineer), and Technician. These hours are looked up from the Forecast sheet and vary by year as the process becomes more automated. They are multiplied by the corresponding hourly rate for each role to get the labour cost per operation.`,
              },
              {
                heading: 'Robot type (Small / Medium / Large)',
                body: `The robot cell used for forming has its own hourly cost, which varies by size. A Large robot costs significantly more per hour than a Small one. This rate is applied to the effective robot hours (after the improvement factor) for every forming, scanning, and cutting operation across all trials and the production run.`,
              },
              {
                heading: 'Sheet material cost',
                body: `Each trial and each production part consumes a sheet of raw material. You enter the cost per full frame sheet and how many parts fit per sheet — the tool divides to get the material cost per part per procedure. Material cost is included in every trial and in the duplicate production procedure.`,
              },
              {
                heading: 'Heat treatment and post-processing',
                body: `HT cost per part covers the heat treatment cycle. Post-processing captures any manual finishing work — sanding, welding, quality checks, and similar. These are split into internal labour and external vendor costs. For the first part there is an additional first-article setup charge. All post-processing costs are added on top of the robot and labour costs.`,
              },
              {
                heading: 'Unistrut fixturing',
                body: `Some parts require a unistrut fixture to hold the sheet during forming. When the unistrut toggle is on, the tool adds Technician time for building and setting up the fixture. That time decreases year-on-year as fixturing becomes more standardised.`,
              },
              {
                heading: 'Fixed overhead per part',
                body: `Every part carries a small fixed overhead regardless of complexity: Purchaser time to source materials and manage suppliers, and Project Manager time to coordinate the work. Both roles contribute a setup charge on the first part and a smaller recurring overhead on every duplicate.`,
              },
              {
                heading: 'Project-level costs',
                body: `On top of the per-part costs, the project carries its own overhead. RPE time for splitting and DFM analysis (turning a full CAD model into individual formable surfaces) is a one-time charge on the first assembly. Assembly-level post-processing — welding, final QC, and any integration work — is charged on every assembly.`,
              },
              {
                heading: 'Margin and quoted price',
                body: `The tool totals all costs to produce an internal cost figure. The quoted price is then calculated by applying the gross margin: Quoted Price = Total Cost ÷ (1 − Margin). For example, a 70% margin means the customer pays roughly 3.3× the internal cost. The margin is set at the project level.`,
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

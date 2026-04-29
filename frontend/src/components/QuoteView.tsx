import { useState, useEffect, useRef } from 'react'
import { api } from '../api/client'
import type { QuoteResult, PartCostDetail, Part, YearPrice, CategoryBreakdown } from '../types'
import QuotePDFContent from './QuotePDFContent'
import { partDisplayName } from '../utils/manufacturing'

interface Props { projectId: number }

const $  = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const $2 = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
const pct = (n: number) => `${(n * 100).toFixed(0)}%`
const $k  = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : $(n)

function niceMax(val: number): number {
  if (val <= 0) return 1000
  const mag = Math.pow(10, Math.floor(Math.log10(val)))
  return Math.ceil(val / mag) * mag
}

function CostBarChart({ parts, details }: { parts: Part[]; details: PartCostDetail[] }) {
  if (!details.length) return null

  const ml = 52, mr = 20, mt = 16, mb = 56
  const W = 680, H = 270
  const cW = W - ml - mr
  const cH = H - mt - mb

  const maxVal = Math.max(...details.flatMap(d => [d.first_part_cost, d.dup_part_cost]), 0)
  const yMax   = niceMax(maxVal)
  const TICKS  = 4

  const n      = parts.length
  const groupW = cW / Math.max(n, 1)
  const barW   = Math.min(Math.max(groupW * 0.32, 14), 54)
  const gap    = barW * 0.28

  const sy = (v: number) => cH - (v / yMax) * cH

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '16px 0 4px', marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-600)', padding: '0 20px 10px' }}>
        Cost per Part — First Part vs Duplicate
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <g transform={`translate(${ml},${mt})`}>
          {/* Grid lines + Y axis labels */}
          {Array.from({ length: TICKS + 1 }, (_, i) => {
            const val = (yMax / TICKS) * i
            const y   = sy(val)
            return (
              <g key={i}>
                <line x1={0} y1={y} x2={cW} y2={y} stroke="#E5E5E5" strokeWidth={1} />
                <text x={-6} y={y + 4} textAnchor="end" fontSize={10} fill="#6B6B6B">{$k(val)}</text>
              </g>
            )
          })}

          {/* Bar groups */}
          {details.map((d, i) => {
            const cx   = (i + 0.5) * groupW
            const fH   = Math.max((d.first_part_cost / yMax) * cH, 0)
            const dH   = Math.max((d.dup_part_cost   / yMax) * cH, 0)
            const name = parts[i]?.name ?? ''
            const label = name.length > 15 ? name.slice(0, 14) + '…' : name

            return (
              <g key={i}>
                <rect x={cx - gap / 2 - barW} y={sy(d.first_part_cost)} width={barW} height={fH} fill="#FF9900" rx={2}>
                  <title>First Part: {$2(d.first_part_cost)}</title>
                </rect>
                <rect x={cx + gap / 2}         y={sy(d.dup_part_cost)}   width={barW} height={dH} fill="#4A7FC1" rx={2}>
                  <title>Duplicate Part: {$2(d.dup_part_cost)}</title>
                </rect>
                <text x={cx} y={cH + 18} textAnchor="middle" fontSize={11} fill="#2E2E2E">{label}</text>
              </g>
            )
          })}

          {/* X baseline */}
          <line x1={0} y1={cH} x2={cW} y2={cH} stroke="#CCCCCC" strokeWidth={1} />
        </g>

        {/* Legend */}
        <g transform={`translate(${(W - 194) / 2}, ${H - 12})`}>
          <rect x={0} y={-9} width={10} height={10} fill="#FF9900" rx={1} />
          <text x={14} y={0} fontSize={11} fill="#2E2E2E">First Part</text>
          <rect x={90} y={-9} width={10} height={10} fill="#4A7FC1" rx={1} />
          <text x={104} y={0} fontSize={11} fill="#2E2E2E">Duplicate Part</text>
        </g>
      </svg>
    </div>
  )
}

const YEARS = [2026, 2027, 2028]

function YearPriceChart({ yearPrices, currentYear }: { yearPrices: Record<number, YearPrice>; currentYear: number }) {
  const ml = 52, mr = 20, mt = 28, mb = 56
  const W = 680, H = 270
  const cW = W - ml - mr
  const cH = H - mt - mb
  const TICKS = 4

  const allVals = YEARS.flatMap(y => [yearPrices[y]?.first_assembly_price ?? 0, yearPrices[y]?.dup_assembly_price ?? 0])
  const yMax = niceMax(Math.max(...allVals, 0))
  const sy = (v: number) => cH - (v / yMax) * cH

  const groupW = cW / YEARS.length
  const barW = Math.min(groupW * 0.28, 60)
  const gap = barW * 0.3

  const base2026First = yearPrices[2026]?.first_assembly_price ?? 0

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '16px 0 4px', marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-600)', padding: '0 20px 10px' }}>
        Assembly Price by Year of Execution
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <g transform={`translate(${ml},${mt})`}>
          {Array.from({ length: TICKS + 1 }, (_, i) => {
            const val = (yMax / TICKS) * i
            const y = sy(val)
            return (
              <g key={i}>
                <line x1={0} y1={y} x2={cW} y2={y} stroke="#E5E5E5" strokeWidth={1} />
                <text x={-6} y={y + 4} textAnchor="end" fontSize={10} fill="#6B6B6B">{$k(val)}</text>
              </g>
            )
          })}

          {YEARS.map((yr, i) => {
            const cx = (i + 0.5) * groupW
            const first = yearPrices[yr]?.first_assembly_price ?? 0
            const dup   = yearPrices[yr]?.dup_assembly_price   ?? 0
            const fH = Math.max((first / yMax) * cH, 0)
            const dH = Math.max((dup   / yMax) * cH, 0)
            const isSelected = yr === currentYear
            const savings = base2026First > 0 && yr > 2026
              ? `−${((1 - first / base2026First) * 100).toFixed(0)}%`
              : null

            return (
              <g key={yr}>
                {isSelected && (
                  <rect x={cx - groupW * 0.45} y={0} width={groupW * 0.9} height={cH}
                    fill="#FF9900" fillOpacity={0.05} rx={4} />
                )}
                <rect x={cx - gap / 2 - barW} y={sy(first)} width={barW} height={fH} fill="#FF9900" rx={2} fillOpacity={isSelected ? 1 : 0.6}>
                  <title>First Assembly: {$2(first)}</title>
                </rect>
                <rect x={cx + gap / 2} y={sy(dup)} width={barW} height={dH} fill="#4A7FC1" rx={2} fillOpacity={isSelected ? 1 : 0.6}>
                  <title>Duplicate Assembly: {$2(dup)}</title>
                </rect>
                {savings && (
                  <text x={cx - gap / 2 - barW / 2} y={sy(first) - 5} textAnchor="middle" fontSize={10} fill="#22a06b" fontWeight="700">{savings}</text>
                )}
                <text x={cx} y={cH + 18} textAnchor="middle" fontSize={12} fill={isSelected ? '#191919' : '#6B6B6B'} fontWeight={isSelected ? '700' : '400'}>{yr}</text>
                {isSelected && (
                  <text x={cx} y={cH + 32} textAnchor="middle" fontSize={9} fill="#FF9900" fontWeight="600">selected</text>
                )}
              </g>
            )
          })}

          <line x1={0} y1={cH} x2={cW} y2={cH} stroke="#CCCCCC" strokeWidth={1} />
        </g>

        {/* Legend */}
        <g transform={`translate(${(W - 230) / 2}, ${H - 12})`}>
          <rect x={0} y={-9} width={10} height={10} fill="#FF9900" rx={1} />
          <text x={14} y={0} fontSize={11} fill="#2E2E2E">First Assembly</text>
          <rect x={120} y={-9} width={10} height={10} fill="#4A7FC1" rx={1} />
          <text x={134} y={0} fontSize={11} fill="#2E2E2E">Duplicate Assembly</text>
        </g>
      </svg>
    </div>
  )
}

function Section({ title, subtitle, total, totalLabel, defaultOpen = true, children }: {
  title: string
  subtitle?: string
  total?: number
  totalLabel?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="quote-section">
      <div className="quote-section-header" onClick={() => setOpen(o => !o)}>
        <div>
          <span className="quote-section-title">{title}</span>
          {subtitle && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 1, fontWeight: 400 }}>{subtitle}</div>}
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {total !== undefined && (
            <div style={{ textAlign: 'right' }}>
              <div className="quote-section-total">{$(total)}</div>
              {totalLabel && <div style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 500, marginTop: 1 }}>{totalLabel}</div>}
            </div>
          )}
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </div>
      {open && children}
    </div>
  )
}

function BreakdownTable({ label, detail, isFirst }: { label: string; detail: PartCostDetail; isFirst: boolean }) {
  const bd  = isFirst ? detail.first_breakdown  : detail.dup_breakdown
  const tot = isFirst ? detail.first_part_cost  : detail.dup_part_cost

  const rows: [string, number][] = isFirst
    ? [
        ['Pre-IF Procedure (Pre-IF Form + Scan)', (bd as ReturnType<typeof Object.assign>).pre_if_trials],
        ['IF Procedure (IF Form + Scan)',          (bd as ReturnType<typeof Object.assign>).if_trials],
        ['RPE Setup (skirt/path/sim)',             (bd as ReturnType<typeof Object.assign>).rpe_setup],
        ['Purchaser Setup',                        (bd as ReturnType<typeof Object.assign>).purchaser_setup],
        ['PM Setup',                               (bd as ReturnType<typeof Object.assign>).pm_setup],
        ['Prep for Shipping',                      bd.prep_shipping],
        ['Unistrut',                               bd.unistrut],
        ['Purchaser Per Run',                       bd.purchaser_overhead],
        ['PM Per Run',                             bd.pm_overhead],
        ['Post Processing + HT',                   bd.post_processing],
        ['Final Scan / Cut',                       (bd as ReturnType<typeof Object.assign>).final_scan_cut_scan],
      ]
    : [
        ['Duplicate Procedure (Dup Form + Scan + Scan + Cut)', (bd as ReturnType<typeof Object.assign>).duplicate_procedure],
        ['Prep for Shipping',    bd.prep_shipping],
        ['Unistrut',             bd.unistrut],
        ['Purchaser Overhead',   bd.purchaser_overhead],
        ['PM Overhead',          bd.pm_overhead],
        ['Post Processing + HT', bd.post_processing],
      ]

  return (
    <table className="quote-table">
      <thead>
        <tr>
          <th>{label}</th>
          <th className="right">Cost</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, val]) => (
          <tr key={name}>
            <td style={{ paddingLeft: 32 }}>{name}</td>
            <td className="right">{$2(val)}</td>
          </tr>
        ))}
        <tr className="subtotal">
          <td>Total per Part</td>
          <td className="right">{$2(tot)}</td>
        </tr>
      </tbody>
    </table>
  )
}

function DetailedBreakdownTable({ label, rows, total }: { label: string; rows: [string, number][]; total: number }) {
  return (
    <table className="quote-table">
      <thead>
        <tr>
          <th>{label}</th>
          <th className="right">Cost</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, val]) => (
          <tr key={name}>
            <td style={{ paddingLeft: 32 }}>{name}</td>
            <td className="right">{$2(val)}</td>
          </tr>
        ))}
        <tr className="subtotal">
          <td>Total per Part</td>
          <td className="right">{$2(total)}</td>
        </tr>
      </tbody>
    </table>
  )
}

function CategoryBreakdownTable({ label, breakdown, total, totalLabel = 'Total per Part' }: { label: string; breakdown: CategoryBreakdown; total: number; totalLabel?: string }) {
  const rows: [string, number][] = [
    ['Labor',              breakdown.labor],
    ['Robot',              breakdown.robot],
    ['Heat Treat',         breakdown.heat_treat],
    ['Shipping',           breakdown.shipping],
    ['Non-Roboformed Parts', breakdown.non_roboformed],
  ].filter(([, val]) => (val as number) > 0) as [string, number][]
  return (
    <table className="quote-table">
      <thead>
        <tr>
          <th>{label} — Category Summary</th>
          <th className="right">Cost</th>
          <th className="right">% of Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, val]) => (
          <tr key={name}>
            <td style={{ paddingLeft: 32 }}>{name}</td>
            <td className="right">{$2(val)}</td>
            <td className="right" style={{ color: 'var(--gray-400)', fontSize: 12 }}>
              {total > 0 ? `${((val / total) * 100).toFixed(1)}%` : '—'}
            </td>
          </tr>
        ))}
        <tr className="subtotal">
          <td>{totalLabel}</td>
          <td className="right">{$2(total)}</td>
          <td className="right">100%</td>
        </tr>
      </tbody>
    </table>
  )
}

export default function QuoteView({ projectId }: Props) {
  const [quote, setQuote]     = useState<QuoteResult | null>(null)
  const [loading, setLoad]    = useState(true)
  const [error, setError]     = useState('')
  const [exporting, setExport]       = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const pdfRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoad(true)
    api.getQuote(projectId)
      .then(setQuote)
      .catch(e => setError(e.message))
      .finally(() => setLoad(false))
  }, [projectId])

  async function downloadPDF() {
    if (!pdfRef.current || !quote) return
    setExport(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const canvas = await html2canvas(pdfRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
      const imgData = canvas.toDataURL('image/jpeg', 0.85)
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width / 2, canvas.height / 2] })
      pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width / 2, canvas.height / 2)
      pdf.save(`${quote.project.name} — Quote.pdf`)
    } finally {
      setExport(false)
    }
  }

  if (loading) return <div className="loading">Calculating quote…</div>
  if (error)   return <div style={{ padding: 32, color: '#c0392b' }}>Error: {error}</div>
  if (!quote)  return null

  const { project, parts, part_details, total_cost, quoted_price,
          first_assembly_cost, dup_assembly_cost, first_assembly_price, dup_assembly_price,
          num_dup_assemblies, rpe_splitting, proj_purchaser, proj_pm, margin, year_prices } = quote

  return (
    <div className="quote-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="quote-title">{project.name} — Quote</div>
        <button className="btn-primary" onClick={downloadPDF} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Download Shareable Quote PDF'}
        </button>
      </div>
      <div style={{ borderBottom: '1px solid var(--gray-200)', marginBottom: 24 }} />

      {/* ── Project details bar ── */}
      <div style={{ display: 'flex', gap: 32, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          ['Year of Execution',   project.year_of_execution],
          ['Assemblies',          `${project.quantity_of_assemblies} (1 first + ${num_dup_assemblies} duplicate)`],
          ['Unique Parts',        parts.length],
          ['Blended Margin',      quoted_price > 0 ? pct((quoted_price - total_cost) / quoted_price) : '—'],
          ...(project.material_type ? [['Material', project.material_type]] : []),
        ].map(([label, value]) => (
          <div key={String(label)}>
            <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 14, color: 'var(--gray-600)', fontWeight: 500 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Summary cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
        <div className="summary-card highlight">
          <div className="summary-card-label">Total Price</div>
          <div className="summary-card-value">{$(quoted_price)}</div>
        </div>
        <div className="summary-card highlight">
          <div className="summary-card-label">Duplicate Assembly Price</div>
          <div className="summary-card-value">{$(dup_assembly_price ?? dup_assembly_cost / (1 - margin))}</div>
        </div>
        <div className="summary-card highlight">
          <div className="summary-card-label">First Assembly Price</div>
          <div className="summary-card-value">{$(first_assembly_price ?? first_assembly_cost / (1 - margin))}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        <div className="summary-card">
          <div className="summary-card-label">Total Cost</div>
          <div className="summary-card-value">{$(total_cost)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-label">Duplicate Assembly Cost</div>
          <div className="summary-card-value">{$(dup_assembly_cost)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-label">First Assembly Cost</div>
          <div className="summary-card-value">{$(first_assembly_cost)}</div>
        </div>
      </div>

      {/* ── Project category breakdown ── */}
      {quote.project_category_breakdown && (
        <Section title="Cost Breakdown by Category" defaultOpen={false}>
          <CategoryBreakdownTable
            label="Total Project"
            breakdown={quote.project_category_breakdown}
            total={total_cost}
            totalLabel="Total Project Cost"
          />
        </Section>
      )}

      {/* ── Cost bar chart ── */}
      <CostBarChart parts={parts} details={part_details} />

      {/* ── Year-over-year price chart ── */}
      {year_prices && <YearPriceChart yearPrices={year_prices} currentYear={project.year_of_execution} />}

      {/* ── Project-level overhead ── */}
      <Section title="Project-Level Overhead (Cost)" total={rpe_splitting + (proj_purchaser ?? 0) + (proj_pm ?? 0) + project.assembly_first_part_setup + project.assembly_pp_internal + project.assembly_pp_external + (project.shipping_cost ?? 0)} totalLabel="total cost" defaultOpen={false}>
        <table className="quote-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="right">First Assembly</th>
              <th className="right">Duplicate Assembly</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>RPE Splitting / DFM Analysis</td>
              <td className="right">{$2(rpe_splitting)}</td>
              <td className="right">—</td>
            </tr>
            <tr>
              <td>Purchaser Overhead</td>
              <td className="right">{$2(proj_purchaser ?? 0)}</td>
              <td className="right">—</td>
            </tr>
            <tr>
              <td>PM Overhead</td>
              <td className="right">{$2(proj_pm ?? 0)}</td>
              <td className="right">—</td>
            </tr>
            <tr>
              <td>Assembly Post-Processing (Internal)</td>
              <td className="right">{$2(project.assembly_pp_internal)}</td>
              <td className="right">{$2(project.assembly_pp_internal)}</td>
            </tr>
            <tr>
              <td>Assembly Post-Processing (External)</td>
              <td className="right">{$2(project.assembly_pp_external)}</td>
              <td className="right">{$2(project.assembly_pp_external)}</td>
            </tr>
            <tr>
              <td>First Part Additional Set Up</td>
              <td className="right">{$2(project.assembly_first_part_setup)}</td>
              <td className="right">—</td>
            </tr>
            <tr>
              <td>Shipping</td>
              <td className="right">{$2(project.shipping_cost ?? 0)}</td>
              <td className="right">—</td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* ── Per-part sections ── */}
      {parts.map((part, i) => {
        const detail = part_details[i]
        if (!detail) return null
        return (
          <Section
            key={part.id}
            title={partDisplayName(part.name, part.manufacturing_method)}
            subtitle={`${part.quantity_per_assembly} per assembly`}
            total={detail.dup_assembly}
            totalLabel="duplicate cost / assembly"
            defaultOpen={false}
          >
            {part.manufacturing_method !== 'roboformed' ? (
              <table className="quote-table" style={{ borderTop: '1px solid var(--gray-200)' }}>
                <thead><tr><th>Cost</th><th className="right">Per Part</th></tr></thead>
                <tbody>
                  <tr><td style={{ paddingLeft: 32 }}>First Part</td><td className="right">{$2(detail.first_part_cost)}</td></tr>
                  <tr><td style={{ paddingLeft: 32 }}>Duplicate Part</td><td className="right">{$2(detail.dup_part_cost)}</td></tr>
                </tbody>
              </table>
            ) : (
              detail.first_detailed_breakdown && detail.dup_detailed_breakdown ? (
                <>
                  <div style={{ padding: '16px 20px 12px', fontSize: 14, fontWeight: 700, color: '#191919', borderTop: '1px solid var(--gray-200)' }}>
                    Detailed Cost Breakdown
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                    <div style={{ borderRight: '1px solid var(--gray-200)' }}>
                      <DetailedBreakdownTable label="First Part" rows={detail.first_detailed_breakdown} total={detail.first_part_cost} />
                    </div>
                    <div>
                      <DetailedBreakdownTable label="Duplicate Part" rows={detail.dup_detailed_breakdown} total={detail.dup_part_cost} />
                    </div>
                  </div>
                </>
              ) : null
            )}
          </Section>
        )
      })}

      {/* ── Total roll-up ── */}
      <div className="quote-section">
        <table className="quote-table">
          <tbody>
            <tr className="subtotal">
              <td>Total Project Cost (all assemblies)</td>
              <td className="right">{$2(total_cost)}</td>
            </tr>
            <tr className="subtotal">
              <td>Quoted Price ({pct(margin)} margin)</td>
              <td className="right" style={{ color: 'var(--orange)', fontSize: 15 }}>{$2(quoted_price)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Schedule ── */}
      {(() => {
        const ROBOT_LABELS: Record<string, string> = {
          Small: 'Small (KR500, M900)',
          Medium: 'Medium (KR1000, KR1500, M1000)',
          Large: 'Large (M2000)',
        }
        const rows = parts.map(p => ({
          name:           partDisplayName(p.name, p.manufacturing_method),
          robot:          ROBOT_LABELS[p.robot_strength] ?? p.robot_strength,
          forming:        p.forming_time_hrs,
          scanning:       p.scanning_time_hrs,
          cutting:        p.cutting_time_hrs,
          preIf:          p.est_pre_if_procedures,
          ifTrials:       p.est_if_procedures,
          totalParts:     p.quantity_per_assembly * project.quantity_of_assemblies,
        }))

        function downloadCSV() {
          const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
          const headers = ['Part', 'Robot Cell', 'Forming (hrs)', 'Scanning (hrs)', 'Cutting (hrs)', 'Pre-IF Trials', 'IF Trials', 'Total Parts to Deliver']
          const lines = [
            headers.map(escape).join(','),
            ...rows.map(r => [r.name, r.robot, r.forming, r.scanning, r.cutting, r.preIf, r.ifTrials, r.totalParts].map(escape).join(',')),
          ]
          const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${project.name} — Schedule.csv`
          a.click()
          URL.revokeObjectURL(url)
        }

        return (
          <div className="quote-section" style={{ marginTop: 24 }}>
            <div className="quote-section-header" style={{ cursor: 'pointer' }} onClick={() => setScheduleOpen(o => !o)}>
              <span className="quote-section-title">Project Schedule</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={e => { e.stopPropagation(); downloadCSV() }}>
                  Download CSV
                </button>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
                  style={{ transform: scheduleOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            {scheduleOpen && <table className="quote-table">
              <thead>
                <tr>
                  <th>Part</th>
                  <th>Robot Cell</th>
                  <th className="right">Forming (hrs)</th>
                  <th className="right">Scanning (hrs)</th>
                  <th className="right">Cutting (hrs)</th>
                  <th className="right">Pre-IF Trials</th>
                  <th className="right">IF Trials</th>
                  <th className="right">Total Parts to Deliver</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.name}>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td style={{ color: 'var(--gray-500)', fontSize: 12 }}>{r.robot}</td>
                    <td className="right">{r.forming}</td>
                    <td className="right">{r.scanning}</td>
                    <td className="right">{r.cutting || '—'}</td>
                    <td className="right">{r.preIf}</td>
                    <td className="right">{r.ifTrials}</td>
                    <td className="right" style={{ fontWeight: 600 }}>{r.totalParts}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 1 && (
                <tfoot>
                  <tr className="subtotal">
                    <td colSpan={2}>Total</td>
                    <td className="right">{rows.reduce((s, r) => s + r.forming, 0).toFixed(2)}</td>
                    <td className="right">{rows.reduce((s, r) => s + r.scanning, 0).toFixed(2)}</td>
                    <td className="right">{rows.reduce((s, r) => s + r.cutting, 0).toFixed(2)}</td>
                    <td className="right">{rows.reduce((s, r) => s + r.preIf, 0)}</td>
                    <td className="right">{rows.reduce((s, r) => s + r.ifTrials, 0)}</td>
                    <td className="right">{rows.reduce((s, r) => s + r.totalParts, 0)}</td>
                  </tr>
                </tfoot>
              )}
            </table>}
          </div>
        )
      })()}

      {/* Hidden PDF render target */}
      <div style={{ position: 'fixed', left: -9999, top: 0, pointerEvents: 'none' }}>
        <div ref={pdfRef}>
          <QuotePDFContent quote={quote} />
        </div>
      </div>

    </div>
  )
}

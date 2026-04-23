import type { QuoteResult, Part, PartCostDetail, YearPrice } from '../types'
import { partDisplayName } from '../utils/manufacturing'

interface Props { quote: QuoteResult }

const $ = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const $k = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : $(n)

function niceMax(val: number) {
  if (val <= 0) return 1000
  const mag = Math.pow(10, Math.floor(Math.log10(val)))
  return Math.ceil(val / mag) * mag
}

const YEARS = [2026, 2027, 2028]

function YearChart({ yearPrices, currentYear }: { yearPrices: Record<number, YearPrice>; currentYear: number }) {
  const ml = 52, mr = 20, mt = 28, mb = 48
  const W = 680, H = 240
  const cW = W - ml - mr, cH = H - mt - mb
  const TICKS = 4
  const allVals = YEARS.map(y => yearPrices[y]?.quoted_price ?? 0)
  const yMax = niceMax(Math.max(...allVals, 0))
  const sy = (v: number) => cH - (v / yMax) * cH
  const groupW = cW / YEARS.length
  const barW = Math.min(groupW * 0.4, 80)
  const base = yearPrices[2026]?.quoted_price ?? 0

  return (
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
          const price = yearPrices[yr]?.quoted_price ?? 0
          const pH = Math.max((price / yMax) * cH, 0)
          const isSelected = yr === currentYear
          const savings = base > 0 && yr > 2026 ? `−${((1 - price / base) * 100).toFixed(0)}%` : null
          return (
            <g key={yr}>
              {isSelected && <rect x={cx - groupW * 0.45} y={0} width={groupW * 0.9} height={cH} fill="#FF9900" fillOpacity={0.05} rx={4} />}
              <rect x={cx - barW / 2} y={sy(price)} width={barW} height={pH} fill="#FF9900" rx={2} fillOpacity={isSelected ? 1 : 0.6} />
              {savings && <text x={cx} y={sy(price) - 6} textAnchor="middle" fontSize={10} fill="#22a06b" fontWeight="700">{savings}</text>}
              <text x={cx} y={cH + 16} textAnchor="middle" fontSize={12} fill={isSelected ? '#191919' : '#6B6B6B'} fontWeight={isSelected ? '700' : '400'}>{yr}</text>
              {isSelected && <text x={cx} y={cH + 28} textAnchor="middle" fontSize={9} fill="#FF9900" fontWeight="600">selected</text>}
            </g>
          )
        })}
        <line x1={0} y1={cH} x2={cW} y2={cH} stroke="#CCCCCC" strokeWidth={1} />
      </g>
    </svg>
  )
}

function PartPriceChart({ parts, details, margin }: { parts: Part[]; details: PartCostDetail[]; margin: number }) {
  if (!details.length) return null
  const ml = 52, mr = 20, mt = 16, mb = 56
  const W = 680, H = 240
  const cW = W - ml - mr, cH = H - mt - mb
  const TICKS = 4
  const maxVal = Math.max(...details.flatMap(d => [d.first_part_cost, d.dup_part_cost].map(v => v / (1 - margin))), 0)
  const yMax = niceMax(maxVal)
  const sy = (v: number) => cH - (v / yMax) * cH
  const n = parts.length
  const groupW = cW / Math.max(n, 1)
  const barW = Math.min(Math.max(groupW * 0.32, 14), 54)
  const gap = barW * 0.28

  return (
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
        {details.map((d, i) => {
          const cx = (i + 0.5) * groupW
          const fp = d.first_part_cost / (1 - margin)
          const dp = d.dup_part_cost   / (1 - margin)
          const fH = Math.max((fp / yMax) * cH, 0)
          const dH = Math.max((dp / yMax) * cH, 0)
          const name = parts[i]?.name ?? ''
          const label = name.length > 15 ? name.slice(0, 14) + '…' : name
          return (
            <g key={i}>
              <rect x={cx - gap / 2 - barW} y={sy(fp)} width={barW} height={fH} fill="#FF9900" rx={2} />
              <rect x={cx + gap / 2}         y={sy(dp)} width={barW} height={dH} fill="#4A7FC1" rx={2} />
              <text x={cx} y={cH + 18} textAnchor="middle" fontSize={11} fill="#2E2E2E">{label}</text>
            </g>
          )
        })}
        <line x1={0} y1={cH} x2={cW} y2={cH} stroke="#CCCCCC" strokeWidth={1} />
      </g>
      <g transform={`translate(${(W - 194) / 2}, ${H - 12})`}>
        <rect x={0} y={-9} width={10} height={10} fill="#FF9900" rx={1} />
        <text x={14} y={0} fontSize={11} fill="#2E2E2E">First Part</text>
        <rect x={90} y={-9} width={10} height={10} fill="#4A7FC1" rx={1} />
        <text x={104} y={0} fontSize={11} fill="#2E2E2E">Duplicate Part</text>
      </g>
    </svg>
  )
}

export default function QuotePDFContent({ quote }: Props) {
  const { project, parts, part_details, quoted_price,
          first_assembly_cost, dup_assembly_cost, first_assembly_price, dup_assembly_price,
          num_dup_assemblies, margin, year_prices } = quote

  const firstAssemblyPrice = first_assembly_price ?? first_assembly_cost / (1 - margin)
  const dupAssemblyPrice   = dup_assembly_price   ?? dup_assembly_cost   / (1 - margin)

  return (
    <div style={{ fontFamily: "'Roboto', sans-serif", background: '#fff', color: '#191919', width: 800, padding: 0 }}>

      {/* ── Header ── */}
      <div style={{ background: '#191919', padding: '28px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#FF9900', marginBottom: 4 }}>Machina Labs</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#FCFCFC' }}>{project.name}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'rgba(252,252,252,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Quote</div>
          <div style={{ fontSize: 13, color: 'rgba(252,252,252,0.75)' }}>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
      </div>

      {/* ── Project details ── */}
      <div style={{ background: '#F5F5F5', padding: '14px 40px', display: 'flex', gap: 40, borderBottom: '1px solid #E8E8E8' }}>
        {[
          ['Year', project.year_of_execution],
          ['Assemblies', `${project.quantity_of_assemblies} (1 first + ${num_dup_assemblies} duplicate)`],
          ['Unique Parts', parts.length],
          ...(project.material_type ? [['Material', project.material_type]] : []),
        ].map(([label, value]) => (
          <div key={String(label)}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6B6B6B', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '28px 40px' }}>

        {/* ── Pricing summary ── */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#1A1A1A', marginBottom: 12 }}>Pricing Summary</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
          {[
            ['Total Price',               $(quoted_price)],
            ['Duplicate Assembly Price',  $(dupAssemblyPrice)],
            ['First Assembly Price',      $(firstAssemblyPrice)],
          ].map(([label, value]) => (
            <div key={label} style={{ background: '#191919', borderRadius: 8, padding: '14px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(252,252,252,0.5)', marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#FF9900' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── Project category breakdown (price) ── */}
        {quote.project_category_breakdown && (() => {
          const m = 1 - margin
          const cats: [string, number][] = [
            ['Labor',      quote.project_category_breakdown.labor      / m],
            ['Robot',      quote.project_category_breakdown.robot      / m],
            ['Heat Treat', quote.project_category_breakdown.heat_treat / m],
            ['Shipping',   quote.project_category_breakdown.shipping   / m],
          ]
          return (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#1A1A1A', marginBottom: 12 }}>Price Breakdown by Category</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
                <thead>
                  <tr style={{ background: '#F5F5F5' }}>
                    {['Category', 'Total Price', '% of Total'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6B6B6B', textAlign: h === 'Category' ? 'left' : 'right', borderBottom: '2px solid #E8E8E8' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cats.map(([name, val]) => (
                    <tr key={name}>
                      <td style={{ padding: '9px 16px', fontSize: 13, borderBottom: '1px solid #eee' }}>{name}</td>
                      <td style={{ padding: '9px 16px', fontSize: 13, textAlign: 'right', borderBottom: '1px solid #eee' }}>{$(val)}</td>
                      <td style={{ padding: '9px 16px', fontSize: 13, textAlign: 'right', color: '#6B6B6B', borderBottom: '1px solid #eee' }}>{quoted_price > 0 ? `${((val / quoted_price) * 100).toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#F5F5F5' }}>
                    <td style={{ padding: '9px 16px', fontSize: 13, fontWeight: 700, borderBottom: '1px solid #E8E8E8' }}>Total</td>
                    <td style={{ padding: '9px 16px', fontSize: 13, fontWeight: 700, textAlign: 'right', color: '#FF9900', borderBottom: '1px solid #E8E8E8' }}>{$(quoted_price)}</td>
                    <td style={{ padding: '9px 16px', fontSize: 13, textAlign: 'right', borderBottom: '1px solid #E8E8E8' }}>100%</td>
                  </tr>
                </tbody>
              </table>
            </>
          )
        })()}

        {/* ── Price per part chart ── */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#1A1A1A', marginBottom: 12 }}>Price per Part — First Part vs Duplicate</div>
        <div style={{ border: '1px solid #E8E8E8', borderRadius: 8, padding: '16px 0 4px', marginBottom: 28 }}>
          <PartPriceChart parts={parts} details={part_details} margin={margin} />
        </div>

        {/* ── Per-part breakdown ── */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#1A1A1A', marginBottom: 12 }}>Part Breakdown</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 28 }}>
          <thead>
            <tr style={{ background: '#F5F5F5' }}>
              {['Part', 'Qty / Assembly', 'First Assembly Price', 'Duplicate Assembly Price'].map(h => (
                <th key={h} style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6B6B6B', textAlign: h === 'Part' ? 'left' : 'right', borderBottom: '2px solid #E8E8E8' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parts.map((part, i) => {
              const d = part_details[i]
              if (!d) return null
              return (
                <tr key={part.id}>
                  <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500, borderBottom: '1px solid #eee' }}>{partDisplayName(part.name, part.manufacturing_method)}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, textAlign: 'right', color: '#6B6B6B', borderBottom: '1px solid #eee' }}>{part.quantity_per_assembly}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, textAlign: 'right', borderBottom: '1px solid #eee' }}>{$(d.first_assembly / (1 - margin))}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, textAlign: 'right', borderBottom: '1px solid #eee' }}>{$(d.dup_assembly / (1 - margin))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* ── Total ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, borderBottom: '1px solid #eee' }}>Total Price</td>
              <td style={{ padding: '8px 16px', fontSize: 15, textAlign: 'right', fontWeight: 700, color: '#FF9900', borderBottom: '1px solid #eee' }}>{$(quoted_price)}</td>
            </tr>
          </tbody>
        </table>

      </div>
    </div>
  )
}

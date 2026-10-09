import type { QuoteResult } from '../types'
import LeaseYearChart from './LeaseYearChart'

interface Props { quote: QuoteResult }

const $ = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const th: React.CSSProperties = { padding: '10px 16px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6B6B6B', borderBottom: '2px solid #E8E8E8' }
const td: React.CSSProperties = { padding: '9px 16px', fontSize: 13, borderBottom: '1px solid #eee' }

export default function LeaseQuotePDFContent({ quote }: Props) {
  const years = quote.lease_years ?? 0
  const lines = quote.line_items ?? []
  const schedule = quote.year_schedule ?? []

  return (
    <div style={{ fontFamily: "'Roboto', sans-serif", background: '#fff', color: '#191919', width: 800, padding: 0 }}>
      {/* Header */}
      <div style={{ background: '#191919', padding: '28px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#FF9900', marginBottom: 4 }}>Machina Labs</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#FCFCFC' }}>{quote.project.name}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'rgba(252,252,252,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Cell Lease Quote</div>
          <div style={{ fontSize: 13, color: 'rgba(252,252,252,0.75)' }}>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
      </div>

      {/* Details bar */}
      <div style={{ background: '#F5F5F5', padding: '14px 40px', display: 'flex', gap: 40, borderBottom: '1px solid #E8E8E8' }}>
        {[
          ['Lease Length', `${years} years`],
          ['RoboCraftsman Cells', `${quote.total_cells ?? 0}${quote.cell_tier ? ` (${quote.cell_tier} tier)` : ''}`],
          ['Multi-year Discount', quote.discount_applied ? '5% (5+ years)' : 'None'],
        ].map(([label, value]) => (
          <div key={label}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6B6B6B', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '28px 40px' }}>
        {/* Summary cards */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#1A1A1A', marginBottom: 12 }}>Pricing Summary</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            ['Total Contract Price', $(quote.total_contract ?? 0)],
            ['One-Time Setup', $(quote.setup_total ?? 0)],
            ['Annual Lease', $(quote.annual_total ?? 0)],
          ].map(([label, value]) => (
            <div key={label} style={{ background: '#191919', borderRadius: 8, padding: '14px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(252,252,252,0.5)', marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#FF9900' }}>{value}</div>
            </div>
          ))}
        </div>

        {quote.discount_applied && (
          <div style={{ background: '#e6f4ea', border: '1px solid #b7e0c3', borderRadius: 8, padding: '10px 14px', marginBottom: 24, fontSize: 13, color: '#256a3a' }}>
            <strong>5% multi-year discount applied</strong> (lease is {years} years). Each cell’s annual price is reduced by 5%:
            annual before discount {$(quote.annual_undiscounted ?? 0)} → <strong>{$(quote.annual_total ?? 0)}</strong>, saving {$(quote.annual_savings ?? 0)} per year.
          </div>
        )}

        {/* Annual cost by year (chart) */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#1A1A1A', marginBottom: 12 }}>Annual Cost by Year</div>
        <div style={{ border: '1px solid #E8E8E8', borderRadius: 8, padding: '14px 10px 4px', marginBottom: 28 }}>
          <LeaseYearChart schedule={schedule} />
        </div>

        {/* Leased items */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#1A1A1A', marginBottom: 12 }}>Leased Items</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F5F5F5' }}>
              <th style={{ ...th, textAlign: 'left' }}>Item</th>
              <th style={{ ...th, textAlign: 'right' }}>Qty</th>
              <th style={{ ...th, textAlign: 'right' }}>Setup</th>
              <th style={{ ...th, textAlign: 'right' }}>Annual</th>
              <th style={{ ...th, textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={td}>{l.label}</td>
                <td style={{ ...td, textAlign: 'right' }}>{l.quantity}</td>
                <td style={{ ...td, textAlign: 'right' }}>{$(l.setup_line)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{$(l.annual_line)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{$(l.setup_line + l.annual_line * years)}</td>
              </tr>
            ))}
            <tr style={{ background: '#F5F5F5' }}>
              <td style={{ ...td, fontWeight: 700 }}>Totals</td>
              <td style={td} />
              <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{$(quote.setup_total ?? 0)}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{$(quote.annual_total ?? 0)}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#FF9900' }}>{$(quote.total_contract ?? 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

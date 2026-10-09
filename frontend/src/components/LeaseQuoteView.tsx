import { useState, useEffect, useRef } from 'react'
import { api } from '../api/client'
import type { QuoteResult } from '../types'
import LeaseQuotePDFContent from './LeaseQuotePDFContent'
import LeaseYearChart from './LeaseYearChart'

interface Props { projectId: number }

const $ = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtWhen = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso.replace(' ', 'T') + 'Z')
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
const smallPrimaryBtn: React.CSSProperties = { background: 'var(--orange, #FF9900)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 12px', background: 'var(--gray-100)', borderBottom: '1px solid var(--gray-200)' }
const td: React.CSSProperties = { fontSize: 13, color: 'var(--gray-800)', padding: '10px 12px', borderBottom: '1px solid var(--gray-100)' }

export default function LeaseQuoteView({ projectId }: Props) {
  const [quote, setQuote] = useState<QuoteResult | null>(null)
  const [loading, setLoad] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExport] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const pdfRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoad(true)
    api.getQuote(projectId).then(setQuote).catch(e => setError(e.message)).finally(() => setLoad(false))
  }, [projectId, reloadKey])

  async function doRefresh() {
    setRefreshing(true)
    try { await api.refreshQuote(projectId); setReloadKey(k => k + 1) }
    finally { setRefreshing(false) }
  }

  async function downloadPDF() {
    if (!pdfRef.current || !quote) return
    setExport(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
      const canvas = await html2canvas(pdfRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
      const imgData = canvas.toDataURL('image/jpeg', 0.85)
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width / 2, canvas.height / 2] })
      pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width / 2, canvas.height / 2)
      pdf.save(`${quote.project.name} - Lease Quote.pdf`)
    } finally { setExport(false) }
  }

  if (loading) return <div className="loading">Calculating quote…</div>
  if (error)   return <div style={{ padding: 32, color: '#c0392b' }}>Error: {error}</div>
  if (!quote)  return null

  const years = quote.lease_years ?? 0
  const lines = quote.line_items ?? []
  const schedule = quote.year_schedule ?? []
  const hasItems = lines.length > 0

  const card = (label: string, value: string, sub?: string) => (
    <div style={{ background: '#191919', borderRadius: 10, padding: '14px 18px', flex: 1, minWidth: 180 }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(252,252,252,0.5)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--orange, #FF9900)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'rgba(252,252,252,0.6)', marginTop: 4 }}>{sub}</div>}
    </div>
  )

  return (
    <div className="quote-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="quote-title">{quote.project.name} — Cell Lease Quote</div>
        <button className="btn-primary" onClick={downloadPDF} disabled={exporting || !hasItems}>
          {exporting ? 'Exporting…' : 'Download Shareable Quote PDF'}
        </button>
      </div>
      <div style={{ borderBottom: '1px solid var(--gray-200)', marginBottom: 20 }} />

      {/* Snapshot / update status */}
      {quote.snapshot && (
        <div style={{ marginBottom: 22 }}>
          {(quote.stale || quote.inputs_stale) ? (
            <div style={{ background: 'var(--orange-soft, #fff3e0)', border: '1px solid var(--orange, #FF9900)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, color: 'var(--gray-800)' }}>
                  {quote.inputs_stale
                    ? <><strong>Inputs have changed since this quote</strong> (saved {fmtWhen(quote.snapshot.created_at)}). Update it to apply your edits.</>
                    : <><strong>This quote uses older pricing</strong> (saved {fmtWhen(quote.snapshot.created_at)}). Newer pricing is available.</>}
                </span>
                <button onClick={doRefresh} disabled={refreshing} style={smallPrimaryBtn}>{refreshing ? 'Updating…' : 'Update quote'}</button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>Up to date · saved {fmtWhen(quote.snapshot.created_at)}</div>
          )}
        </div>
      )}

      {!hasItems ? (
        <div style={{ padding: '24px 0', color: 'var(--gray-500)' }}>
          Add RoboCraftsman cells (and optionally laser welding) on the Cell Lease tab to generate a quote.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            {card('Total Contract Price', $(quote.total_contract ?? 0), `${years} year lease`)}
            {card('One-Time Setup', $(quote.setup_total ?? 0), 'Install & training')}
            {card('Annual Lease', $(quote.annual_total ?? 0), quote.discount_applied ? '5% multi-year discount applied' : 'per year')}
          </div>

          {quote.discount_applied && (
            <div style={{ background: '#e6f4ea', border: '1px solid #b7e0c3', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#256a3a' }}>
              <strong>5% multi-year discount applied</strong> — lease length is {years} years (5+). The annual price of every cell is reduced by 5%.
              Annual before discount: {$(quote.annual_undiscounted ?? 0)} → <strong>{$(quote.annual_total ?? 0)}</strong> (saving {$(quote.annual_savings ?? 0)}/yr).
            </div>
          )}

          {/* Annual cost by year (chart) */}
          <div className="section-heading" style={{ marginTop: 0 }}>Annual Cost by Year</div>
          <div style={{ border: '1px solid var(--gray-200)', borderRadius: 10, padding: '16px 10px 6px', marginBottom: 28 }}>
            <LeaseYearChart schedule={schedule} />
          </div>

          {/* Leased items */}
          <div className="section-heading" style={{ marginTop: 0 }}>Leased Items</div>
          <div style={{ border: '1px solid var(--gray-200)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={th}>Item</th>
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
                <tr style={{ background: 'var(--gray-50, #f9f9f9)' }}>
                  <td style={{ ...td, fontWeight: 700 }}>Totals</td>
                  <td style={{ ...td, textAlign: 'right' }} />
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{$(quote.setup_total ?? 0)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{$(quote.annual_total ?? 0)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--orange, #d97800)' }}>{$(quote.total_contract ?? 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Hidden PDF render target */}
      <div style={{ position: 'fixed', left: -9999, top: 0, pointerEvents: 'none' }}>
        <div ref={pdfRef}><LeaseQuotePDFContent quote={quote} /></div>
      </div>
    </div>
  )
}

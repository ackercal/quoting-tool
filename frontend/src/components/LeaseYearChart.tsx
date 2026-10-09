import type { LeaseYear } from '../types'

const ORANGE = '#FF9900'
const SETUP = '#9a5b00'

function niceMax(val: number): number {
  if (val <= 0) return 1000
  const mag = Math.pow(10, Math.floor(Math.log10(val)))
  return Math.ceil(val / mag) * mag
}
const fmt = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  : n >= 1e3 ? `$${Math.round(n / 1e3)}k`
  : `$${Math.round(n)}`

export default function LeaseYearChart({ schedule }: { schedule: LeaseYear[] }) {
  if (!schedule.length) return null
  const ml = 56, mr = 16, mt = 26, mb = 40
  const W = 680, H = 250
  const cW = W - ml - mr, cH = H - mt - mb
  const TICKS = 4
  const yMax = niceMax(Math.max(...schedule.map(y => y.total), 0))
  const sy = (v: number) => cH - (v / yMax) * cH
  const n = schedule.length
  const groupW = cW / n
  const barW = Math.min(groupW * 0.5, 70)
  const hasSetup = schedule.some(y => y.setup > 0)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <g transform={`translate(${ml},${mt})`}>
        {Array.from({ length: TICKS + 1 }, (_, i) => {
          const val = (yMax / TICKS) * i
          const y = sy(val)
          return (
            <g key={i}>
              <line x1={0} y1={y} x2={cW} y2={y} stroke="#E5E5E5" strokeWidth={1} />
              <text x={-8} y={y + 4} textAnchor="end" fontSize={10} fill="#6B6B6B">{fmt(val)}</text>
            </g>
          )
        })}
        {schedule.map((y, i) => {
          const cx = (i + 0.5) * groupW
          const x = cx - barW / 2
          const annualH = Math.max((y.annual / yMax) * cH, 0)
          const setupH = Math.max((y.setup / yMax) * cH, 0)
          const annualY = cH - annualH
          const setupY = annualY - setupH
          return (
            <g key={y.year}>
              {setupH > 0 && <rect x={x} y={setupY} width={barW} height={setupH} fill={SETUP} rx={2} />}
              <rect x={x} y={annualY} width={barW} height={annualH} fill={ORANGE} rx={2} />
              <text x={cx} y={setupY - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="#2E2E2E">{fmt(y.total)}</text>
              <text x={cx} y={cH + 16} textAnchor="middle" fontSize={12} fill="#6B6B6B">Year {y.year}</text>
            </g>
          )
        })}
        <line x1={0} y1={cH} x2={cW} y2={cH} stroke="#CCCCCC" strokeWidth={1} />
      </g>
      {hasSetup && (
        <g transform={`translate(${(W - 190) / 2}, ${H - 8})`}>
          <rect x={0} y={-9} width={10} height={10} fill={ORANGE} rx={1} />
          <text x={14} y={0} fontSize={11} fill="#2E2E2E">Annual lease</text>
          <rect x={100} y={-9} width={10} height={10} fill={SETUP} rx={1} />
          <text x={114} y={0} fontSize={11} fill="#2E2E2E">One-time setup</text>
        </g>
      )}
    </svg>
  )
}

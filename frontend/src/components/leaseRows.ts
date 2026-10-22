import type { QuoteResult } from '../types'

// A quote line in the finance "Edge Factory" format: each leased thing becomes a
// Subscription (annual) row and an Installation & Training (one-time) row.
// unitPrice is the normal/list price; discountedPrice is the net unit price when a
// multi-year discount applies (null otherwise). annualFee / leaseTotal are net.
export interface LeaseRow {
  item: string
  description: string
  unitPrice: number
  discountedPrice: number | null
  quantity: number
  term: 'Annual' | 'One-Time'
  annualFee: number | null   // null on one-time rows
  leaseTotal: number
}

const SIZE_WORD: Record<string, string> = { Small: 'Small', Medium: 'Medium-sized', Large: 'Large' }

export function leaseLineRows(quote: QuoteResult): LeaseRow[] {
  const years = quote.lease_years ?? 0
  const lines = quote.line_items ?? []
  // Aggregate robot lines by type so duplicate cell entries collapse into one row.
  const byType = new Map<string, typeof lines[number]>()
  for (const l of lines.filter(x => x.kind === 'robot')) {
    const key = l.robot_type || 'Small'
    const cur = byType.get(key)
    if (cur) {
      cur.quantity += l.quantity
      cur.annual_line += l.annual_line
      cur.setup_line += l.setup_line
    } else {
      byType.set(key, { ...l, robot_type: key })
    }
  }
  const robots = [...byType.values()]
  const laser = lines.find(l => l.kind === 'laser')
  const misc = lines.filter(l => l.kind === 'misc')
  const rows: LeaseRow[] = []

  // RoboCraftsman cell subscriptions (one row per robot size).
  for (const r of robots) {
    const size = r.robot_type ? (SIZE_WORD[r.robot_type] ?? r.robot_type) : ''
    const models = (r.label || '').match(/\(([^)]+)\)/)?.[1]
    rows.push({
      item: `RoboCraftsman Cell Subscription${r.robot_type ? ` — ${r.robot_type}` : ''}`,
      description: `${size} cell${models ? ` (${models})` : ''} and the Machina software to operate it. Includes onsite support: cell operations, maintenance, and spare parts. Excludes shipping.`,
      unitPrice: r.annual_each_base,
      discountedPrice: r.annual_each < r.annual_each_base ? r.annual_each : null,
      quantity: r.quantity,
      term: 'Annual',
      annualFee: r.annual_line,
      leaseTotal: r.annual_line * years,
    })
  }
  // RoboCraftsman installation & training (one aggregated one-time row).
  const totalRobotCells = robots.reduce((s, r) => s + r.quantity, 0)
  if (totalRobotCells > 0) {
    const setupEach = robots[0]?.setup_each ?? 0
    rows.push({
      item: 'RoboCraftsman Installation & Training',
      description: 'Installation of all cells and training of onsite staff.',
      unitPrice: setupEach,
      discountedPrice: null,
      quantity: totalRobotCells,
      term: 'One-Time',
      annualFee: null,
      leaseTotal: robots.reduce((s, r) => s + r.setup_line, 0),
    })
  }
  // Laser welding subscription + installation.
  if (laser && laser.quantity > 0) {
    rows.push({
      item: 'Laser Welding Subscription',
      description: 'Laser welding equipment and maintenance (including spare parts).',
      unitPrice: laser.annual_each_base,
      discountedPrice: laser.annual_each < laser.annual_each_base ? laser.annual_each : null,
      quantity: laser.quantity,
      term: 'Annual',
      annualFee: laser.annual_line,
      leaseTotal: laser.annual_line * years,
    })
    rows.push({
      item: 'Laser Welding Installation & Training',
      description: 'Installation of laser welding and training of onsite staff.',
      unitPrice: laser.setup_each,
      discountedPrice: null,
      quantity: laser.quantity,
      term: 'One-Time',
      annualFee: null,
      leaseTotal: laser.setup_line,
    })
  }
  // Additional misc priced items — each contributes an annual and/or one-time row.
  for (const m of misc) {
    const name = m.label || 'Additional item'
    const hasAnnual = m.annual_each > 0
    const hasSetup = m.setup_each > 0
    if (hasAnnual) {
      rows.push({
        item: name,
        description: '',
        unitPrice: m.annual_each,
        discountedPrice: null,
        quantity: 1,
        term: 'Annual',
        annualFee: m.annual_each,
        leaseTotal: m.annual_each * years,
      })
    }
    if (hasSetup) {
      rows.push({
        item: hasAnnual ? `${name} — Setup` : name,
        description: '',
        unitPrice: m.setup_each,
        discountedPrice: null,
        quantity: 1,
        term: 'One-Time',
        annualFee: null,
        leaseTotal: m.setup_each,
      })
    }
  }
  return rows
}

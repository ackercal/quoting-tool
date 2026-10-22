import { useState, useEffect, useRef } from 'react'
import { api } from '../api/client'
import type { ProjectCode } from '../api/client'
import type { Project, LeaseItem, LeaseMisc } from '../types'
import NumInput from './NumInput'
import { ProjectCodeSelect } from './ProjectForm'

const ROBOT_SLOTS: { key: 'Small' | 'Medium' | 'Large'; label: string }[] = [
  { key: 'Small',  label: 'Small (KR500, M900)' },
  { key: 'Medium', label: 'Medium (KR1500, M1000)' },
  { key: 'Large',  label: 'Large (M2000)' },
]
type SlotKey = 'Small' | 'Medium' | 'Large' | 'laser'

interface Props {
  project: Project
  onUpdate: (p: Project) => void
}

function initQty(items: LeaseItem[]): Record<SlotKey, number> {
  const q: Record<SlotKey, number> = { Small: 0, Medium: 0, Large: 0, laser: 0 }
  for (const it of items) {
    if (it.kind === 'laser') q.laser += it.quantity
    else if (it.robot_type) q[it.robot_type] = it.quantity
  }
  return q
}

export default function LeaseForm({ project, onUpdate }: Props) {
  const [form, setForm]       = useState(project)
  const [items, setItems]     = useState<LeaseItem[]>(project.lease_items ?? [])
  const [qty, setQty]         = useState<Record<SlotKey, number>>(initQty(project.lease_items ?? []))
  const [misc, setMisc]       = useState<LeaseMisc[]>(project.lease_misc ?? [])
  const [codes, setCodes]     = useState<ProjectCode[]>([])
  const [saveStatus, setSave] = useState<'idle' | 'saving' | 'saved'>('idle')

  const savedRef  = useRef<string>(JSON.stringify(project))
  const itemsRef  = useRef(items);  useEffect(() => { itemsRef.current = items }, [items])
  const qtyRef    = useRef(qty);    useEffect(() => { qtyRef.current = qty }, [qty])
  const miscRef   = useRef(misc);   useEffect(() => { miscRef.current = misc }, [misc])
  const timers    = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    setForm(project)
    savedRef.current = JSON.stringify(project)
    // Load the latest lease items directly — the parent's copy can be stale after a
    // project-level save or a tab switch (the PUT /projects response omits lease data).
    let alive = true
    api.getProject(project.id)
      .then(p => { if (alive) { const li = p.lease_items ?? []; setItems(li); setQty(initQty(li)); setMisc(p.lease_misc ?? []) } })
      .catch(() => { if (alive) { const li = project.lease_items ?? []; setItems(li); setQty(initQty(li)); setMisc(project.lease_misc ?? []) } })
    return () => { alive = false }
  }, [project.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.listProjectCodes({ show_all: true }).then(d => setCodes(d.codes)).catch(() => setCodes([])) }, [])

  const selectedCode = codes.find(c => c.code === form.project_code) || null
  const set = (key: keyof Project, value: unknown) => setForm(f => ({ ...f, [key]: value }))

  // Auto-save project-level fields (name, status, code link, lease length).
  useEffect(() => {
    const serialized = JSON.stringify(form)
    if (serialized === savedRef.current) return
    if (!form.name.trim()) return
    setSave('saving')
    const t = setTimeout(async () => {
      try {
        const updated = await api.updateProject(form.id, form)
        savedRef.current = serialized
        // Keep lease data on the parent project — the PUT response doesn't include it.
        onUpdate({ ...updated, lease_items: itemsRef.current, lease_misc: miscRef.current })
        setSave('saved'); setTimeout(() => setSave(s => (s === 'saved' ? 'idle' : s)), 1500)
      } catch { setSave('idle') }
    }, 600)
    return () => clearTimeout(t)
  }, [form, onUpdate])

  // Persist a slot's quantity: update the matching lease item, or create one when needed.
  async function reconcile(slot: SlotKey) {
    const n = qtyRef.current[slot]
    const list = itemsRef.current
    const item = slot === 'laser'
      ? list.find(i => i.kind === 'laser')
      : list.find(i => i.kind === 'robot' && i.robot_type === slot)
    try {
      if (item) {
        if (item.quantity !== n) {
          await api.updateLeaseItem(item.id, { kind: item.kind, robot_type: item.robot_type, quantity: n })
          setItems(prev => prev.map(i => (i.id === item.id ? { ...i, quantity: n } : i)))
        }
      } else if (n > 0) {
        const created = await api.createLeaseItem(form.id, slot === 'laser' ? { kind: 'laser', quantity: n } : { kind: 'robot', robot_type: slot, quantity: n })
        setItems(prev => [...prev, created])
      }
      setSave('saved'); setTimeout(() => setSave(s => (s === 'saved' ? 'idle' : s)), 1500)
    } catch { setSave('idle') }
  }

  function changeQty(slot: SlotKey, raw: number) {
    const n = Math.max(0, Math.round(raw))
    setQty(q => ({ ...q, [slot]: n }))
    setSave('saving')
    clearTimeout(timers.current[slot])
    timers.current[slot] = setTimeout(() => reconcile(slot), 500)
  }

  // ── Additional misc priced items ──
  async function addMisc() {
    setSave('saving')
    try {
      const created = await api.createLeaseMisc(form.id, { name: '', setup_price: 0, annual_price: 0 })
      setMisc(prev => [...prev, created])
      setSave('saved'); setTimeout(() => setSave(s => (s === 'saved' ? 'idle' : s)), 1500)
    } catch { setSave('idle') }
  }
  function changeMisc(id: number, patch: Partial<LeaseMisc>) {
    setMisc(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)))
    setSave('saving')
    const key = `misc-${id}`
    clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(async () => {
      const m = miscRef.current.find(x => x.id === id)
      if (!m) return
      try {
        await api.updateLeaseMisc(id, { name: m.name, setup_price: m.setup_price, annual_price: m.annual_price })
        setSave('saved'); setTimeout(() => setSave(s => (s === 'saved' ? 'idle' : s)), 1500)
      } catch { setSave('idle') }
    }, 600)
  }
  async function removeMisc(id: number) {
    setSave('saving')
    try {
      await api.deleteLeaseMisc(id)
      setMisc(prev => prev.filter(m => m.id !== id))
      setSave('saved'); setTimeout(() => setSave(s => (s === 'saved' ? 'idle' : s)), 1500)
    } catch { setSave('idle') }
  }

  const lockInput: React.CSSProperties = { background: 'var(--gray-100)', color: 'var(--gray-500)', cursor: 'not-allowed' }
  const qtyRow: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--gray-100)', maxWidth: 440 }

  return (
    <div className="content-area">
      <div className="page-title">{form.name}</div>

      <div className="section-heading">Quote Details</div>
      <div className="form-grid">
        <div className="field">
          <label>Quote Name <span className="required">*</span></label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Acme Edge Factory Lease" />
        </div>
        <div className="field">
          <label>Status</label>
          <select value={form.quote_status ?? 'Open'} onChange={e => set('quote_status', e.target.value)}>
            <option value="Open">Open</option>
            <option value="Closed Won">Closed Won</option>
            <option value="Not Used">Not Used</option>
          </select>
        </div>
        <div className="field span2">
          <label>Project Code <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(optional)</span></label>
          <ProjectCodeSelect codes={codes} value={form.project_code ?? null} onSelect={c => set('project_code', c ? c.code : null)} />
        </div>
        <div className="field">
          <label>Account Name</label>
          <input value={selectedCode?.customer ?? ''} placeholder={form.project_code ? '—' : 'Select a project code'} disabled readOnly style={lockInput} />
        </div>
        <div className="field">
          <label>Project Name</label>
          <input value={selectedCode?.project_name ?? ''} placeholder={form.project_code ? '—' : 'Select a project code'} disabled readOnly style={lockInput} />
        </div>
      </div>

      <div className="section-heading">Lease Terms</div>
      <div className="form-grid">
        <div className="field">
          <label>Lease Length (years) <span className="required">*</span></label>
          <NumInput min={3} step={1} value={form.lease_years ?? 3}
            onChange={v => set('lease_years', Math.max(3, Math.round(v)))} />
          <div className="field-hint">Minimum 3 years. Leases of 5+ years get a 5% discount on each cell’s annual price.</div>
        </div>
      </div>

      <div className="section-heading">RoboCraftsman Cells</div>
      <div style={{ marginBottom: 8 }}>
        {ROBOT_SLOTS.map(s => (
          <div key={s.key} style={qtyRow}>
            <span style={{ fontSize: 14, color: 'var(--gray-800)' }}>{s.label}</span>
            <div className="field" style={{ width: 110 }}>
              <NumInput min={0} step={1} value={qty[s.key]} onChange={v => changeQty(s.key, v)} />
            </div>
          </div>
        ))}
      </div>

      <div className="section-heading">Laser Welding</div>
      <div style={qtyRow}>
        <span style={{ fontSize: 14, color: 'var(--gray-800)' }}>Quantity</span>
        <div className="field" style={{ width: 110 }}>
          <NumInput min={0} step={1} value={qty.laser} onChange={v => changeQty('laser', v)} />
        </div>
      </div>

      {/* ── Additional misc prices ── */}
      <div className="section-heading">Additional Misc Price</div>
      <div className="field-hint" style={{ marginTop: -8, marginBottom: 12 }}>
        Add any other line items. All values are <strong>prices</strong> (what the customer pays), not costs.
      </div>
      {misc.map(m => (
        <div key={m.id} style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: '2 1 220px', minWidth: 180 }}>
            <label>Name</label>
            <input value={m.name} onChange={e => changeMisc(m.id, { name: e.target.value })} placeholder="e.g. Spare parts package" />
          </div>
          <div className="field" style={{ flex: '0 0 170px' }}>
            <label>One-Time Setup Price ($)</label>
            <NumInput min={0} step={0.01} value={m.setup_price} onChange={v => changeMisc(m.id, { setup_price: Math.max(0, v) })} />
          </div>
          <div className="field" style={{ flex: '0 0 150px' }}>
            <label>Annual Price ($)</label>
            <NumInput min={0} step={0.01} value={m.annual_price} onChange={v => changeMisc(m.id, { annual_price: Math.max(0, v) })} />
          </div>
          <button onClick={() => removeMisc(m.id)} title="Remove"
            style={{ border: 'none', background: 'none', color: 'var(--gray-400)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px', marginBottom: 8, flexShrink: 0 }}>×</button>
        </div>
      ))}
      <button onClick={addMisc}
        style={{ fontSize: 13, fontWeight: 600, border: '1px dashed var(--gray-300)', background: '#fff', color: 'var(--gray-700)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>
        + Add misc price
      </button>

      <div className="save-bar" style={{ marginTop: 28 }}>
        <span className="save-status" style={{ color: 'var(--gray-500)', fontSize: 13 }}>
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : 'Changes save automatically'}
        </span>
      </div>
    </div>
  )
}

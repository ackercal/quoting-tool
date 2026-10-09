import { useState, useEffect, useRef } from 'react'
import { api } from '../api/client'
import type { ProjectCode } from '../api/client'
import type { Project, LeaseItem } from '../types'
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
  const [codes, setCodes]     = useState<ProjectCode[]>([])
  const [saveStatus, setSave] = useState<'idle' | 'saving' | 'saved'>('idle')

  const savedRef  = useRef<string>(JSON.stringify(project))
  const itemsRef  = useRef(items);  useEffect(() => { itemsRef.current = items }, [items])
  const qtyRef    = useRef(qty);    useEffect(() => { qtyRef.current = qty }, [qty])
  const timers    = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    setForm(project); setItems(project.lease_items ?? []); setQty(initQty(project.lease_items ?? []))
    savedRef.current = JSON.stringify(project)
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
        onUpdate(updated)
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

      <div className="save-bar" style={{ marginTop: 28 }}>
        <span className="save-status" style={{ color: 'var(--gray-500)', fontSize: 13 }}>
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : 'Changes save automatically'}
        </span>
      </div>
    </div>
  )
}

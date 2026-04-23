import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { Part } from '../types'
import NumInput from './NumInput'
import { MANUFACTURING_METHODS, partDisplayName } from '../utils/manufacturing'

const ROBOT_IMPROVEMENT: Record<number, number> = { 2026: 1.0, 2027: 0.65, 2028: 0.4225 }

interface Props {
  part: Part
  year: number
  onUpdate: (p: Part) => void
  onDelete: (id: number) => void
  onDuplicate: () => void
}

const ROBOT_STRENGTHS: { value: string; label: string }[] = [
  { value: 'Small',  label: 'Small (KR500, M900)' },
  { value: 'Medium', label: 'Medium (KR1000, KR1500, M1000)' },
  { value: 'Large',  label: 'Large (M2000)' },
]

export default function PartForm({ part, year, onUpdate, onDelete, onDuplicate }: Props) {
  const improvement = ROBOT_IMPROVEMENT[year] ?? 1.0
  const isFuture = year > 2026
  const [form, setForm]          = useState(part)
  const [saveStatus, setSave]    = useState<'idle' | 'saving' | 'saved'>('idle')
  const [confirmDel, setConfirm] = useState(false)

  useEffect(() => { setForm(part) }, [part])

  const set = (key: keyof Part, value: unknown) =>
    setForm(f => ({ ...f, [key]: value }))

  const save = useCallback(async () => {
    setSave('saving')
    try {
      const updated = await api.updatePart(form.id, form)
      onUpdate(updated)
      setSave('saved')
      setTimeout(() => setSave('idle'), 2000)
    } catch {
      setSave('idle')
    }
  }, [form, onUpdate])

  async function handleDelete() {
    await api.deletePart(part.id)
    onDelete(part.id)
  }

  return (
    <div className="content-area">
      <div>
        <div className="page-title">{partDisplayName(form.name, form.manufacturing_method)}</div>
        <div className="page-subtitle">Part-level inputs for cost estimation</div>
      </div>

      {/* ── Part Details ──────────────────────────────────── */}
      <div className="section-heading">Part Details</div>
      <div className="form-grid">
        <div className="field">
          <label>Part Name <span className="required">*</span></label>
          <input value={form.name} onChange={e => set('name', e.target.value)} />
        </div>
        <div className="field">
          <label>Quantity Per Assembly <span className="required">*</span></label>
          <NumInput min={1} value={form.quantity_per_assembly}
            onChange={v => set('quantity_per_assembly', Math.max(1, Math.round(v)))} />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Manufacturing Method <span className="required">*</span></label>
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--gray-200)', width: 'fit-content', marginTop: 4 }}>
            {(['roboformed', 'other'] as const).map(v => {
              const active = (form.manufacturing_method === 'roboformed' ? 'roboformed' : 'other') === v
              return (
                <button key={v} type="button"
                  style={{ padding: '8px 20px', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: 13, background: active ? 'var(--orange)' : '#fff', color: active ? '#fff' : 'var(--gray-500)', transition: 'background 0.15s' }}
                  onClick={() => set('manufacturing_method', v === 'roboformed' ? 'roboformed' : (form.manufacturing_method !== 'roboformed' ? form.manufacturing_method : 'cnc'))}
                >{v === 'roboformed' ? 'Roboformed' : 'Other'}</button>
              )
            })}
          </div>
        </div>
        {form.manufacturing_method !== 'roboformed' && (
          <div className="field">
            <label>Method <span className="required">*</span></label>
            <select value={form.manufacturing_method} onChange={e => set('manufacturing_method', e.target.value)}>
              {MANUFACTURING_METHODS.filter(m => !m.roboformed).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        )}
        {form.manufacturing_method !== 'roboformed' && (
          <div className="field">
            <label>Manufactured By <span className="required">*</span></label>
            <select value={form.other_mfg_internal ?? 1} onChange={e => set('other_mfg_internal', parseInt(e.target.value))}>
              <option value={1}>Internally</option>
              <option value={0}>Externally (OSP)</option>
            </select>
            <div className="field-hint">External parts use OSP margin; internal parts use internal margin</div>
          </div>
        )}
      </div>

      {form.manufacturing_method !== 'roboformed' && (
        <>
          <div className="section-heading">Cost</div>
          <div className="form-grid" style={{ maxWidth: 640 }}>
            <div className="field">
              <label>First Part Cost ($) <span className="required">*</span></label>
              <div className="field-dollar">
                <NumInput min={0} step={0.01} value={form.other_mfg_cost ?? 0}
                  onChange={v => set('other_mfg_cost', v)} />
              </div>
              <div className="field-hint">Cost for the first instance of this part</div>
            </div>
            <div className="field">
              <label>Duplicate Part Cost ($) <span className="required">*</span></label>
              <div className="field-dollar">
                <NumInput min={0} step={0.01} value={form.other_mfg_cost_dup ?? 0}
                  onChange={v => set('other_mfg_cost_dup', v)} />
              </div>
              <div className="field-hint">Cost for each additional instance</div>
            </div>
          </div>
        </>
      )}

      {form.manufacturing_method === 'roboformed' && (<>
      {/* ── Robot Time ────────────────────────────────────── */}
      <div className="section-heading">Active Robot Time</div>
      <div style={{ fontSize: 12, color: 'var(--gray-400)', lineHeight: 1.6, marginTop: -8, marginBottom: 12 }}>
        <strong style={{ color: 'var(--gray-500)' }}>Skirted surface → run time estimator</strong> in this app is going to be built.
        For now, use the Roboform run time calculator or find a similar previous part and find the run time in Retool.
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Forming Time, current (hrs) <span className="required">*</span></label>
          <NumInput min={0} step={0.01} value={form.forming_time_hrs}
            onChange={v => set('forming_time_hrs', v)} />
        </div>
        <div className="field">
          <label>Scanning Time, current (hrs) <span className="required">*</span></label>
          <NumInput min={0} step={0.01} value={form.scanning_time_hrs}
            onChange={v => set('scanning_time_hrs', v)} />
          <div className="field-hint">Recommended: 0.5 hrs</div>
        </div>
        <div className="field">
          <label>Cutting Time, current (hrs) <span className="required">*</span></label>
          <NumInput min={0} step={0.01} value={form.cutting_time_hrs}
            onChange={v => set('cutting_time_hrs', v)} />
        </div>
      </div>

      {/* ── Robot Type ────────────────────────────────────── */}
      <div className="section-heading">Robot Type</div>
      <div className="form-grid single" style={{ maxWidth: 280 }}>
        <div className="field">
          <label>Strength <span className="required">*</span></label>
          <select value={form.robot_strength} onChange={e => set('robot_strength', e.target.value)}>
            {ROBOT_STRENGTHS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Forming Trial Count ───────────────────────────── */}
      <div className="section-heading">Forming Trial Count</div>
      <div className="form-grid">
        <div className="field">
          <label>Est. Pre-IF Trials <span className="required">*</span></label>
          <NumInput min={0} value={form.est_pre_if_procedures}
            onChange={v => set('est_pre_if_procedures', Math.round(v))} />
          <div className="field-hint">Recommended: 5</div>
        </div>
        <div className="field">
          <label>Est. Tolerancing Runs (IF) <span className="required">*</span></label>
          <NumInput min={0} value={form.est_if_procedures}
            onChange={v => set('est_if_procedures', Math.round(v))} />
          <div className="field-hint">Recommended: 5</div>
        </div>
      </div>

      {/* ── Sheet Stock ───────────────────────────────────── */}
      <div className="section-heading">Sheet Stock</div>
      <div className="field-hint" style={{ marginTop: -8, marginBottom: 12, fontSize: 12 }}>
        For assistance with estimation, use the{' '}
        <a href="/?section=helpers" target="_blank" rel="noreferrer" style={{ color: 'var(--orange)', textDecoration: 'underline' }}>Estimation Context</a>.
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Parts per Full Frame Sheet</label>
          <NumInput min={1} value={form.parts_per_sheet}
            onChange={v => set('parts_per_sheet', Math.max(1, Math.round(v)))} />
        </div>
        <div className="field">
          <label>Cost per Full Frame Sheet ($) <span className="required">*</span></label>
          <div className="field-dollar">
            <NumInput min={0} step={0.01} value={form.cost_per_sheet}
              onChange={v => set('cost_per_sheet', v)} />
          </div>
        </div>
      </div>

      {/* ── HT Details ────────────────────────────────────── */}
      <div className="section-heading">HT Details</div>
      <div className="field-hint" style={{ marginTop: -8, marginBottom: 12, fontSize: 12 }}>
        For assistance with estimation, use the{' '}
        <a href="/?section=helpers" target="_blank" rel="noreferrer" style={{ color: 'var(--orange)', textDecoration: 'underline' }}>Estimation Context</a>.
      </div>
      <div className="form-grid">
        <div className="field">
          <label>HT Cost per Part ($) <span className="required">*</span></label>
          <div className="field-dollar">
            <NumInput min={0} step={0.01} value={form.ht_cost_per_part}
              onChange={v => set('ht_cost_per_part', v)} />
          </div>
        </div>
        <div className="field">
          <label>Unistrut Required?</label>
          <select value={form.unistrut} onChange={e => set('unistrut', parseInt(e.target.value))}>
            <option value={0}>No</option>
            <option value={1}>Yes</option>
          </select>
        </div>
      </div>

      {/* ── Post Processing ───────────────────────────────── */}
      <div className="section-heading">Post Processing Cost (sanding, welding, QC, etc.)</div>
      <div className="form-grid three">
        <div className="field">
          <label>Internal Cost per Part ($)</label>
          <div className="field-dollar">
            <NumInput min={0} step={0.01} value={form.pp_internal}
              onChange={v => set('pp_internal', v)} />
          </div>
        </div>
        <div className="field">
          <label>External Cost per Part ($)</label>
          <div className="field-dollar">
            <NumInput min={0} step={0.01} value={form.pp_external}
              onChange={v => set('pp_external', v)} />
          </div>
          <div className="field-hint">OSP</div>
        </div>
        <div className="field">
          <label>Additional Cost for First Part Setup ($)</label>
          <div className="field-dollar">
            <NumInput min={0} step={0.01} value={form.first_part_additional_setup}
              onChange={v => set('first_part_additional_setup', v)} />
          </div>
          <div className="field-hint">e.g. check and straighten buck</div>
        </div>
      </div>

      {/* ── Other ─────────────────────────────────────────── */}
      <div className="section-heading">Other</div>
      <div className="form-grid" style={{ maxWidth: 640 }}>
        <div className="field">
          <label>Set Up – Skirt, Path Plan, Sim (hrs)</label>
          <NumInput min={0} step={0.25} value={form.setup_skirt_path_plan_sim_hrs}
            onChange={v => set('setup_skirt_path_plan_sim_hrs', v)} />
        </div>
        <div className="field">
          <label>Shipping Cost per Part ($)</label>
          <div className="field-dollar">
            <NumInput min={0} step={0.01} value={form.shipping_cost_per_part}
              onChange={v => set('shipping_cost_per_part', v)} />
          </div>
          <div className="field-hint">To and from HT</div>
        </div>
      </div>
      </>)}

      <div className="save-bar">
        <button className="btn-primary" onClick={save} disabled={saveStatus === 'saving'}>
          {saveStatus === 'saving' ? 'Saving…' : 'Save Part'}
        </button>
        {saveStatus === 'saved' && <span className="save-status saved">✓ Saved</span>}
        <button className="btn-ghost" onClick={onDuplicate}>Duplicate Part</button>
        <button className="btn-danger" style={{ marginLeft: 'auto' }} onClick={() => setConfirm(true)}>Delete Part</button>
      </div>

      {confirmDel && (
        <div className="modal-overlay" onClick={() => setConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Delete "{partDisplayName(part.name, part.manufacturing_method)}"?</div>
            <p style={{ color: 'var(--gray-600)', fontSize: 13 }}>This cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="btn-danger" style={{ border: 'none', padding: '10px 20px', background: '#c0392b', color: '#fff', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
                onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

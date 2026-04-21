import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { Project } from '../types'

interface Props {
  project: Project
  onUpdate: (p: Project) => void
}

const YEARS = [2026, 2027, 2028]
const MATERIAL_TYPES = ['AA-6061-0', 'AA-5052-0', 'AA-7075-0', 'Ti-6Al-4V sheet', 'Other']

export default function ProjectForm({ project, onUpdate }: Props) {
  const [form, setForm]       = useState(project)
  const [saveStatus, setSave] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => { setForm(project) }, [project])

  const set = (key: keyof Project, value: unknown) =>
    setForm(f => ({ ...f, [key]: value }))

  const save = useCallback(async () => {
    setSave('saving')
    try {
      const updated = await api.updateProject(form.id, form)
      onUpdate(updated)
      setSave('saved')
      setTimeout(() => setSave('idle'), 2000)
    } catch {
      setSave('idle')
    }
  }, [form, onUpdate])

  return (
    <div className="content-area">
      <div className="page-title">{form.name}</div>
      <div className="page-subtitle">Project-level configuration and assembly details</div>

      <div className="section-heading">Project Details</div>
      <div className="form-grid">
        <div className="field span2">
          <label>Project Name <span className="required">*</span></label>
          <input value={form.name} onChange={e => set('name', e.target.value)} />
        </div>
        <div className="field">
          <label>Material Type</label>
          <select value={form.material_type || ''} onChange={e => set('material_type', e.target.value || null)}>
            <option value="">Select…</option>
            {MATERIAL_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Quantity of Assemblies to Deliver <span className="required">*</span></label>
          <input type="number" min="1" value={form.quantity_of_assemblies}
            onChange={e => set('quantity_of_assemblies', parseInt(e.target.value) || 1)} />
        </div>
        <div className="field">
          <label>Year of Execution <span className="required">*</span></label>
          <select value={form.year_of_execution} onChange={e => set('year_of_execution', parseInt(e.target.value))}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {form.year_of_execution > 2026 && (
            <div className="field-hint">Robot time improvements for {form.year_of_execution} will be applied automatically.</div>
          )}
        </div>
        <div className="field">
          <label>Internal Margin <span className="required">*</span></label>
          <input type="number" min="0" max="0.99" step="0.01"
            value={form.internal_margin}
            onChange={e => set('internal_margin', parseFloat(e.target.value) || 0)} />
          <div className="field-hint">e.g. 0.70 = 70% margin → price = cost / (1 − margin)</div>
        </div>
        <div className="field">
          <label>Status</label>
          <select value={form.is_active} onChange={e => set('is_active', parseInt(e.target.value))}>
            <option value={1}>Active</option>
            <option value={0}>Inactive</option>
          </select>
        </div>
      </div>

<div className="section-heading">Assembly Post Processing Cost (sanding, welding, QC, etc.)</div>
      <div className="form-grid three">
        <div className="field">
          <label>Production: Internal ($)</label>
          <div className="field-dollar">
            <input type="number" min="0" step="0.01" value={form.assembly_pp_internal}
              onChange={e => set('assembly_pp_internal', parseFloat(e.target.value) || 0)} />
          </div>
        </div>
        <div className="field">
          <label>Production: External ($)</label>
          <div className="field-dollar">
            <input type="number" min="0" step="0.01" value={form.assembly_pp_external}
              onChange={e => set('assembly_pp_external', parseFloat(e.target.value) || 0)} />
          </div>
        </div>
        <div className="field">
          <label>First Part: Additional Cost for Set Up ($)</label>
          <div className="field-dollar">
            <input type="number" min="0" step="0.01" value={form.assembly_first_part_setup}
              onChange={e => set('assembly_first_part_setup', parseFloat(e.target.value) || 0)} />
          </div>
        </div>
      </div>

      <div className="section-heading">Other</div>
      <div className="form-grid single" style={{ maxWidth: 320 }}>
        <div className="field">
          <label>Set Up – Splitting / DFM Analysis (hrs)</label>
          <input type="number" min="0" step="0.25" value={form.setup_splitting_hrs}
            onChange={e => set('setup_splitting_hrs', parseFloat(e.target.value) || 0)} />
          <div className="field-hint">RPE time to split CAD into formable surfaces</div>
        </div>
      </div>

      <div className="save-bar">
        <button className="btn-primary" onClick={save} disabled={saveStatus === 'saving'}>
          {saveStatus === 'saving' ? 'Saving…' : 'Save Project'}
        </button>
        {saveStatus === 'saved' && <span className="save-status saved">✓ Saved</span>}
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { Project } from '../types'
import NumInput from './NumInput'

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
          <label>Status</label>
          <select value={form.is_active} onChange={e => set('is_active', parseInt(e.target.value))}>
            <option value={1}>Active</option>
            <option value={0}>Inactive</option>
          </select>
        </div>
        <div className="field">
          <label>Quantity of Assemblies to Deliver <span className="required">*</span></label>
          <NumInput min={1} value={form.quantity_of_assemblies}
            onChange={v => set('quantity_of_assemblies', Math.max(1, Math.round(v)))} />
        </div>
        <div className="field">
          <label>Year of Execution <span className="required">*</span></label>
          <select value={form.year_of_execution} onChange={e => set('year_of_execution', parseInt(e.target.value))}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {form.year_of_execution > 2026 && (
            <div className="field-hint">
              Labor and robot time improvements for {form.year_of_execution} will be applied automatically.{' '}
              <strong>Enter all estimates (robot times, trial counts) based on current {new Date().getFullYear()} capability</strong> — the tool scales them for the selected year.
            </div>
          )}
        </div>
        <div className="field">
          <label>Internal Margin (%) <span className="required">*</span></label>
          <NumInput min={0} max={99} step={1} value={Math.round(form.internal_margin * 100)}
            onChange={v => set('internal_margin', v / 100)} />
          <div className="field-hint">70% recommended</div>
        </div>
        <div className="field">
          <label>OSP Margin (%) <span className="required">*</span></label>
          <NumInput min={0} max={99} step={1} value={Math.round((form.osp_margin ?? 0.10) * 100)}
            onChange={v => set('osp_margin', v / 100)} />
          <div className="field-hint">Outside Service Provider — 10% recommended</div>
        </div>
      </div>

<div className="section-heading">Assembly Post Processing Cost (sanding, welding, QC, etc.)</div>
      <div className="form-grid three">
        <div className="field">
          <label>Internal Cost per Assembly ($)</label>
          <div className="field-dollar">
            <NumInput min={0} step={0.01} value={form.assembly_pp_internal}
              onChange={v => set('assembly_pp_internal', v)} />
          </div>
        </div>
        <div className="field">
          <label>External Cost per Assembly ($)</label>
          <div className="field-dollar">
            <NumInput min={0} step={0.01} value={form.assembly_pp_external}
              onChange={v => set('assembly_pp_external', v)} />
          </div>
          <div className="field-hint">OSP</div>
        </div>
        <div className="field">
          <label>Additional Cost for First Part Setup ($)</label>
          <div className="field-dollar">
            <NumInput min={0} step={0.01} value={form.assembly_first_part_setup}
              onChange={v => set('assembly_first_part_setup', v)} />
          </div>
          <div className="field-hint">e.g. welding jigs</div>
        </div>
      </div>

      <div className="section-heading">Labor Constants</div>
      <div className="form-grid" style={{ maxWidth: 640 }}>
        <div className="field span2">
          <label>Labor Hours Database <span className="required">*</span></label>
          <select value={form.labor_constants ?? 'formed_parts'} onChange={e => set('labor_constants', e.target.value)}>
            <option value="formed_parts">Formed Parts</option>
            <option value="custom_auto">Custom Auto</option>
          </select>
          <div className="field-hint">Use Formed Parts unless this is a Custom Auto project — Custom Auto uses lower labor hour estimates per step to match their specific process.</div>
        </div>
      </div>

      <div className="section-heading">Other</div>
      <div className="form-grid" style={{ maxWidth: 640 }}>
        <div className="field">
          <label>Cumulative Engineering Set Up Hours for First Assembly</label>
          <NumInput min={0} step={0.25} value={form.setup_splitting_hrs}
            onChange={v => set('setup_splitting_hrs', v)} />
          <div className="field-hint">Splitting, DFM, Jig Design, etc.</div>
        </div>
        <div className="field">
          <label>Shipping Cost ($)</label>
          <div className="field-dollar">
            <NumInput min={0} step={0.01} value={form.shipping_cost}
              onChange={v => set('shipping_cost', v)} />
          </div>
          <div className="field-hint">Delivering project to the customer</div>
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

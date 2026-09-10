import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { api } from '../api/client'
import type { ProjectCode } from '../api/client'
import type { Project } from '../types'
import NumInput from './NumInput'
import { useUser } from '../user'
import OwnerPicker from './OwnerPicker'

// Only open codes are selectable for a quote: Discovery / Closed Won / Internal.
const PICKABLE_STATUSES = new Set(['Discovery', 'Closed Won', 'Internal'])

// Project-code picker with one search bar that matches across code, customer,
// and project name (same as the Project Code List search). Only open codes
// (Discovery / Closed Won / Internal) are selectable.
function ProjectCodeSelect({ codes, value, onSelect }: {
  codes: ProjectCode[]; value: string | null; onSelect: (c: ProjectCode | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const selected = codes.find(c => c.code === value) || null

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return codes.filter(c => {
      if (!PICKABLE_STATUSES.has(c.status)) return false
      if (!q) return true
      return c.code.toLowerCase().includes(q) ||
        (c.customer || '').toLowerCase().includes(q) ||
        (c.project_name || '').toLowerCase().includes(q)
    })
  }, [codes, query])
  const shown = matches.slice(0, 100)

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div onClick={() => { setOpen(o => !o); setQuery('') }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: '1px solid var(--gray-300)', borderRadius: 8, padding: '9px 12px', background: '#fff', cursor: 'pointer', fontSize: 14, color: selected ? 'var(--gray-900)' : 'var(--gray-400)' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.code : 'Select a project code…'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {selected && <span onClick={e => { e.stopPropagation(); onSelect(null) }} title="Clear" style={{ color: 'var(--gray-400)', fontSize: 16, lineHeight: 1 }}>×</span>}
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search code, customer, or project name…"
            style={{ width: '100%', border: 'none', borderBottom: '1px solid var(--gray-200)', padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {shown.length === 0 && <div style={{ padding: '10px 12px', color: 'var(--gray-400)', fontSize: 13 }}>No matching codes</div>}
            {shown.map(c => (
              <div key={c.id} onClick={() => { onSelect(c); setOpen(false) }}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 14, background: c.code === value ? 'var(--gray-100)' : '#fff' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--gray-100)')}
                onMouseLeave={e => (e.currentTarget.style.background = c.code === value ? 'var(--gray-100)' : '#fff')}>
                <div style={{ fontWeight: 600, fontFamily: 'ui-monospace, monospace', color: 'var(--gray-900)' }}>{c.code}</div>
                <div style={{ color: 'var(--gray-500)', fontSize: 12 }}>{[c.customer, c.project_name].filter(Boolean).join(' · ') || '—'}</div>
              </div>
            ))}
            {matches.length > shown.length && (
              <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--gray-400)', borderTop: '1px solid var(--gray-100)' }}>
                Showing first {shown.length} — keep typing to narrow.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface Props {
  project: Project
  onUpdate: (p: Project) => void
}

const YEARS = [2026, 2028, 2030]
const MATERIAL_TYPES = ['AA-6061-0', 'AA-5052-0', 'AA-7075-0', 'Ti-6Al-4V sheet', 'Other']

export default function ProjectForm({ project, onUpdate }: Props) {
  const { adminMode } = useUser()
  const [form, setForm]       = useState(project)
  const [saveStatus, setSave] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [codes, setCodes]     = useState<ProjectCode[]>([])

  useEffect(() => { setForm(project) }, [project])
  useEffect(() => { api.listProjectCodes({ show_all: true }).then(d => setCodes(d.codes)).catch(() => setCodes([])) }, [])

  const selectedCode = codes.find(c => c.code === form.project_code) || null

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
        <div className="field">
          <label>Quote Name <span className="required">*</span></label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. FT — Formed Parts" />
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
          <ProjectCodeSelect
            codes={codes}
            value={form.project_code ?? null}
            onSelect={c => set('project_code', c ? c.code : null)}
          />
        </div>
        <div className="field">
          <label>Account Name</label>
          <input value={selectedCode?.customer ?? ''} placeholder={form.project_code ? '—' : 'Select a project code'} disabled readOnly
            style={{ background: 'var(--gray-100)', color: 'var(--gray-500)', cursor: 'not-allowed' }} />
        </div>
        <div className="field">
          <label>Project Name</label>
          <input value={selectedCode?.project_name ?? ''} placeholder={form.project_code ? '—' : 'Select a project code'} disabled readOnly
            style={{ background: 'var(--gray-100)', color: 'var(--gray-500)', cursor: 'not-allowed' }} />
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

      <div className="section-heading">
        Authorship & Visibility
        {!adminMode && <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--gray-500)', marginLeft: 8 }}>(admin mode required to edit)</span>}
      </div>
      <div className="form-grid" style={{ maxWidth: 640 }}>
        <div className="field">
          <label>Owner</label>
          {adminMode ? (
            <OwnerPicker email={form.author_email ?? ''} onChange={(em, nm) => { set('author_email', em); set('author_name', nm) }} />
          ) : (
            <input value={form.author_name ?? '—'} disabled />
          )}
        </div>
        <div className="field">
          <label>Who Can See This</label>
          <input value={form.access_tag ?? 'all'} disabled={!adminMode}
            onChange={e => set('access_tag', e.target.value)} placeholder="all" />
          <div className="field-hint">“all” = everyone. A vertical tag limits it to users with matching access.</div>
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

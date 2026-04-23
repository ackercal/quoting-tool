import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { Project, Part } from '../types'
import ProjectForm from '../components/ProjectForm'
import PartForm from '../components/PartForm'
import QuoteView from '../components/QuoteView'
import { partDisplayName } from '../utils/manufacturing'

type Selection = { type: 'project' } | { type: 'part'; id: number } | { type: 'quote' }

// ── Icons ──────────────────────────────────────────────────────────────────
const IconFolder = () => (
  <svg className="sidebar-item-icon" fill="currentColor" viewBox="0 0 20 20">
    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
  </svg>
)
const IconPart = () => (
  <svg className="sidebar-item-icon" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.5">
    <circle cx="10" cy="10" r="3" />
    <path strokeLinecap="round" d="M10 3v2M10 15v2M3 10h2M15 10h2" />
  </svg>
)
const IconDollar = () => (
  <svg className="sidebar-item-icon" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" d="M10 3v14M7 5.5h4.5a2 2 0 010 4H8a2 2 0 000 4H14" />
  </svg>
)
const IconBack = () => (
  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
)
const IconPlus = () => (
  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
)

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const projectId = parseInt(id!)

  const [project, setProject] = useState<Project | null>(null)
  const [parts,   setParts]   = useState<Part[]>([])
  const [sel,     setSel]     = useState<Selection>({ type: 'project' })
  const [loading, setLoad]    = useState(true)
  const [notes,   setNotes]   = useState('')
  const [noteTimer, setNoteTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [menuPartId,        setMenuPartId]        = useState<number | null>(null)
  const [deleteConfirmId,   setDeleteConfirmId]   = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    api.getProject(projectId)
      .then(p => {
        setProject(p)
        setParts(p.parts ?? [])
        setNotes(p.internal_notes ?? '')
      })
      .finally(() => setLoad(false))
  }, [projectId])

  useEffect(() => { load() }, [load])

  // Close context menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuPartId(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function duplicatePart(part: Part) {
    const existingNames = new Set(parts.map(p => p.name))
    let name = `Copy of ${part.name}`
    let n = 2
    while (existingNames.has(name)) name = `Copy of ${part.name} (${n++})`
    const { id: _id, project_id: _pid, created_at: _ca, updated_at: _ua, ...fields } = part
    const newPart = await api.createPart(projectId, { ...fields, name })
    setParts(ps => [...ps, newPart])
    setSel({ type: 'part', id: newPart.id })
  }

  async function confirmDeletePart(partId: number) {
    await api.deletePart(partId)
    handlePartDelete(partId)
    setDeleteConfirmId(null)
  }

  async function addPart() {
    const p = await api.createPart(projectId, { name: `Part ${(parts.length + 1)}` })
    setParts(ps => [...ps, p])
    setSel({ type: 'part', id: p.id })
  }

  function handleProjectUpdate(p: Project) {
    setProject(p)
  }

  function handlePartUpdate(updated: Part) {
    setParts(ps => ps.map(p => p.id === updated.id ? updated : p))
  }

  function handlePartDelete(partId: number) {
    setParts(ps => ps.filter(p => p.id !== partId))
    setSel({ type: 'project' })
  }

  function handleNotesChange(val: string) {
    setNotes(val)
    if (noteTimer) clearTimeout(noteTimer)
    const t = setTimeout(async () => {
      if (sel.type === 'part') {
        const part = parts.find(p => p.id === sel.id)
        if (part) {
          const updated = await api.updatePart(sel.id, { ...part, internal_notes: val })
          handlePartUpdate(updated)
        }
      } else if (project) {
        const updated = await api.updateProject(projectId, { ...project, internal_notes: val })
        handleProjectUpdate(updated)
      }
    }, 800)
    setNoteTimer(t)
  }

  // Sync notes textarea when selection changes
  useEffect(() => {
    if (sel.type === 'part') {
      const p = parts.find(p => p.id === (sel as { type: 'part'; id: number }).id)
      setNotes(p?.internal_notes ?? '')
    } else if (sel.type === 'project' && project) {
      setNotes(project.internal_notes ?? '')
    }
  }, [sel, parts, project])

  if (loading) return <div className="loading">Loading project…</div>
  if (!project) return <div style={{ padding: 32 }}>Project not found.</div>

  const activePartId = sel.type === 'part' ? sel.id : null

  return (
    <div className="project-layout">
      {/* ── Sidebar ── */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo" onClick={() => navigate('/')}>Machina Quote Tool</div>
        </div>

        <nav className="sidebar-nav">
          {/* Back */}
          <div className="sidebar-item" onClick={() => navigate('/')}>
            <IconBack />
            <span>All Projects</span>
          </div>

          <div className="sidebar-divider" />

          {/* Project level */}
          <div
            className={`sidebar-item${sel.type === 'project' ? ' active' : ''}`}
            onClick={() => setSel({ type: 'project' })}
          >
            <IconFolder />
            <span>{project.name}</span>
          </div>

          {/* Parts */}
          {parts.map(p => (
            <div
              key={p.id}
              className={`sidebar-item${activePartId === p.id ? ' active' : ''}`}
              style={{ paddingLeft: 28, position: 'relative' }}
              onClick={() => setSel({ type: 'part', id: p.id })}
            >
              <IconPart />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {partDisplayName(p.name, p.manufacturing_method)}
              </span>
              <button
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--gray-400)', fontSize: 16, lineHeight: 1, borderRadius: 4, flexShrink: 0 }}
                onClick={e => { e.stopPropagation(); setMenuPartId(menuPartId === p.id ? null : p.id) }}
                title="More options"
              >⋯</button>
              {menuPartId === p.id && (
                <div ref={menuRef} style={{
                  position: 'absolute', right: 8, top: '100%', zIndex: 100,
                  background: 'var(--white)', border: '1px solid var(--gray-200)',
                  borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                  minWidth: 130, overflow: 'hidden',
                }}>
                  {[
                    { label: 'Duplicate', action: () => { duplicatePart(p); setMenuPartId(null) } },
                    { label: 'Delete',    action: () => { setDeleteConfirmId(p.id); setMenuPartId(null) }, danger: true },
                  ].map(item => (
                    <div
                      key={item.label}
                      onClick={e => { e.stopPropagation(); item.action() }}
                      style={{
                        padding: '9px 14px', fontSize: 13, cursor: 'pointer',
                        color: item.danger ? '#c0392b' : 'var(--gray-700)',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--gray-100)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >{item.label}</div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Add part */}
          <div className="sidebar-new-part" onClick={addPart}>
            <IconPlus />
            <span>New Part</span>
          </div>

          {/* Quote button — inline, after parts */}
          <div className="sidebar-divider" style={{ margin: '16px 0' }} />
          <div style={{ padding: '0 12px 8px' }}>
            <button
              className="sidebar-quote-btn"
              onClick={() => setSel({ type: 'quote' })}
            >
              <IconDollar />
              Quote
            </button>
          </div>
        </nav>
      </div>

      {/* ── Main content ── */}
      <div className="project-main">
        {sel.type === 'project' && (
          <ProjectForm project={project} onUpdate={handleProjectUpdate} />
        )}
        {sel.type === 'part' && (() => {
          const part = parts.find(p => p.id === (sel as { type: 'part'; id: number }).id)
          return part
            ? <PartForm part={part} year={project.year_of_execution} onUpdate={handlePartUpdate} onDelete={handlePartDelete} onDuplicate={() => duplicatePart(part)} />
            : <div className="content-area"><p>Part not found.</p></div>
        })()}
        {sel.type === 'quote' && <QuoteView projectId={projectId} />}
      </div>

      {/* ── Notes panel ── */}
      {sel.type !== 'quote' && (
        <div className="notes-panel">
          <div className="notes-label">Internal Notes</div>
          <textarea
            placeholder={sel.type === 'project'
              ? 'Add notes about this project…'
              : 'Add notes about this part…'}
            value={notes}
            onChange={e => handleNotesChange(e.target.value)}
          />
        </div>
      )}
      {deleteConfirmId !== null && (() => {
        const part = parts.find(p => p.id === deleteConfirmId)
        return (
          <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-title">Delete "{part?.name}"?</div>
              <p style={{ color: 'var(--gray-600)', fontSize: 13 }}>This cannot be undone.</p>
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setDeleteConfirmId(null)}>Cancel</button>
                <button className="btn-danger" style={{ border: 'none', padding: '10px 20px', background: '#c0392b', color: '#fff', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => confirmDeletePart(deleteConfirmId)}>Delete</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

'use client'
import { useMemo, useRef, useState } from 'react'
import {
  Star,
  Award,
  ClipboardCheck,
  Plus,
  X,
  Edit2,
  Eye,
  EyeOff,
  Loader2,
  Trash2,
  CheckCircle2,
  Paperclip,
  Upload,
  Download,
  FileText,
} from 'lucide-react'
import { formatDateTime, timeAgo, getInitials } from '@/lib/workryn/utils'
import { isAdminOrAbove, isManagerOrAbove } from '@/lib/workryn/permissions'

// ── Types ────────────────────────────────────────────────────

type UserLite = {
  id: string
  name: string | null
  email?: string | null
  role: string
  avatarColor: string
  jobTitle?: string | null
  departmentId?: string | null
}

type Criterion = {
  id: string
  label: string
  description: string | null
  order: number
  maxScore: number
}

type Template = {
  id: string
  name: string
  description: string | null
  isActive: boolean
  documentUrl?: string | null
  documentName?: string | null
  documentSize?: number | null
  criteria: Criterion[]
  _count?: { evaluations: number }
}

type ScoreItem = {
  id: string
  score: number
  comment: string | null
  criterionId: string
  criterion: Criterion
}

type Evaluation = {
  id: string
  overallRating: number | null
  comments: string | null
  isPrivate: boolean
  documentUrl?: string | null
  documentName?: string | null
  documentSize?: number | null
  acknowledgedAt: string | null
  createdAt: string
  updatedAt: string
  templateId: string
  agentId: string
  evaluatorId: string
  template: { id: string; name: string; description?: string | null }
  agent: UserLite
  evaluator: UserLite
  scores: ScoreItem[]
}

interface Props {
  initialEvaluations: Evaluation[]
  initialTemplates: Template[]
  users: UserLite[]
  currentUser: { id: string; name: string; role: string; avatarColor: string }
}

type Tab = 'received' | 'given' | 'all' | 'templates'

// ── Small primitives ─────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function StarRow({
  value,
  max = 5,
  onChange,
  size = 18,
  readOnly = false,
}: {
  value: number
  max?: number
  onChange?: (n: number) => void
  size?: number
  readOnly?: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)
  const display = hover ?? value

  return (
    <div
      style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}
      onMouseLeave={() => setHover(null)}
    >
      {Array.from({ length: max }).map((_, i) => {
        const n = i + 1
        const filled = n <= display
        return (
          <button
            key={i}
            type="button"
            disabled={readOnly}
            onClick={() => !readOnly && onChange?.(n)}
            onMouseEnter={() => !readOnly && setHover(n)}
            className={readOnly ? undefined : 'focus-ring'}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: readOnly ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              color: filled ? '#f59e0b' : 'rgba(255,255,255,0.2)',
              transition: 'transform 160ms ease, color 160ms ease',
              transform: !readOnly && hover === n ? 'scale(1.15)' : 'scale(1)',
            }}
            aria-label={`Rate ${n} of ${max}`}
          >
            <Star size={size} fill={filled ? '#f59e0b' : 'none'} strokeWidth={1.75} />
          </button>
        )
      })}
      {!readOnly && (
        <span style={{ marginLeft: 8, fontSize: '0.8125rem', color: 'var(--text-muted)', minWidth: 28 }}>
          {display ? `${display}/${max}` : '—'}
        </span>
      )}
    </div>
  )
}

function Avatar({ user, size = 36 }: { user: { name: string | null; avatarColor: string }; size?: number }) {
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        background: user.avatarColor,
        fontSize: size < 32 ? '0.6875rem' : '0.75rem',
      }}
      aria-hidden="true"
    >
      {getInitials(user.name || '?')}
    </div>
  )
}

// ── Main client component ───────────────────────────────────

export default function EvaluationsClient({
  initialEvaluations,
  initialTemplates,
  users,
  currentUser,
}: Props) {
  const [evaluations, setEvaluations] = useState<Evaluation[]>(initialEvaluations)
  const [templates, setTemplates] = useState<Template[]>(initialTemplates)
  const isManager = isManagerOrAbove(currentUser.role)
  const isAdmin = isAdminOrAbove(currentUser.role)

  const [tab, setTab] = useState<Tab>(isManager ? 'given' : 'received')
  const [detailEval, setDetailEval] = useState<Evaluation | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false)
  const [templateToEdit, setTemplateToEdit] = useState<Template | null>(null)

  // ── Filters per tab ──
  const visible = useMemo(() => {
    if (!isManager) {
      // STAFF: shown regardless of tab
      return evaluations.filter((e) => e.agentId === currentUser.id)
    }
    if (tab === 'received') {
      return evaluations.filter((e) => e.agentId === currentUser.id && !e.isPrivate)
    }
    if (tab === 'given') {
      return evaluations.filter((e) => e.evaluatorId === currentUser.id)
    }
    // 'all' — admin only
    return evaluations
  }, [evaluations, tab, isManager, currentUser.id])

  const staffUsers = useMemo(
    () => users.filter((u) => u.role === 'STAFF' && u.id !== currentUser.id),
    [users, currentUser.id],
  )

  // ── Handlers ──
  async function refreshEvaluations() {
    const res = await fetch('/api/workryn/evaluations')
    if (res.ok) {
      const data = (await res.json()) as Evaluation[]
      setEvaluations(data)
    }
  }

  async function refreshTemplates() {
    const res = await fetch('/api/workryn/evaluations/templates')
    if (res.ok) {
      const data = (await res.json()) as Template[]
      setTemplates(data)
    }
  }

  async function handleAcknowledge(id: string) {
    const res = await fetch(`/api/workryn/evaluations/${id}/acknowledge`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setEvaluations((list) => list.map((e) => (e.id === id ? { ...e, acknowledgedAt: data.acknowledgedAt } : e)))
      if (detailEval?.id === id) {
        setDetailEval((e) => (e ? { ...e, acknowledgedAt: data.acknowledgedAt } : e))
      }
    }
  }

  async function handleDeleteEvaluation(id: string) {
    if (!confirm('Delete this evaluation? This cannot be undone.')) return
    const res = await fetch(`/api/workryn/evaluations/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setEvaluations((list) => list.filter((e) => e.id !== id))
      setDetailEval(null)
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm('Archive this template? It will no longer be available for new evaluations.')) return
    const res = await fetch(`/api/workryn/evaluations/templates/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setTemplates((list) => list.map((t) => (t.id === id ? { ...t, isActive: false } : t)))
    }
  }

  // ── Render ──
  const tabBtn = (id: Tab, label: string, count?: number) => (
    <button
      key={id}
      className={`eval-tab focus-ring ${tab === id ? 'active' : ''}`}
      onClick={() => setTab(id)}
      type="button"
    >
      {label}
      {typeof count === 'number' && <span className="eval-tab-count">{count}</span>}
    </button>
  )

  const givenCount = evaluations.filter((e) => e.evaluatorId === currentUser.id).length
  const receivedCount = evaluations.filter((e) => e.agentId === currentUser.id && !e.isPrivate).length

  return (
    <>
      <div className="page-header" style={{ padding: '24px 32px 20px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <div>
            <h1 className="gradient-text" style={{ marginBottom: 4 }}>
              Performance Evaluations
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {isManager
                ? 'Review and author performance evaluations for your team.'
                : 'View performance reviews from your supervisor.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {isManager && staffUsers.length > 0 && templates.some((t) => t.isActive) && (
              <button
                className="btn btn-gradient focus-ring"
                onClick={() => setShowCreate(true)}
                type="button"
              >
                <Plus size={18} /> New Evaluation
              </button>
            )}
            {isAdmin && tab === 'templates' && (
              <button
                className="btn btn-gradient focus-ring"
                onClick={() => {
                  setTemplateToEdit(null)
                  setShowTemplateBuilder(true)
                }}
                type="button"
              >
                <Plus size={18} /> New Template
              </button>
            )}
          </div>
        </div>

        {isManager && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tabBtn('given', 'Evaluations Given', givenCount)}
            {tabBtn('received', 'My Evaluations', receivedCount)}
            {isAdmin && tabBtn('all', 'All Evaluations', evaluations.length)}
            {isAdmin && tabBtn('templates', 'Templates', templates.filter((t) => t.isActive).length)}
          </div>
        )}
      </div>

      <div className="page-body" style={{ paddingTop: 20 }}>
        {tab === 'templates' && isAdmin ? (
          <TemplatesGrid
            templates={templates}
            isAdmin={isAdmin}
            onEdit={(t) => {
              setTemplateToEdit(t)
              setShowTemplateBuilder(true)
            }}
            onDelete={handleDeleteTemplate}
          />
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <Award size={44} />
            <p>
              {isManager
                ? tab === 'given'
                  ? 'You have not authored any evaluations yet.'
                  : tab === 'received'
                  ? 'No evaluations have been shared with you yet.'
                  : 'No evaluations to show.'
                : 'Your supervisor has not shared any evaluations yet.'}
            </p>
          </div>
        ) : (
          <div className="eval-grid">
            {visible.map((e, i) => (
              <EvaluationCard
                key={e.id}
                evaluation={e}
                currentUserId={currentUser.id}
                index={i}
                onOpen={() => setDetailEval(e)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Detail Modal ── */}
      {detailEval && (
        <EvaluationDetailModal
          evaluation={detailEval}
          currentUser={currentUser}
          onClose={() => setDetailEval(null)}
          onAcknowledge={() => handleAcknowledge(detailEval.id)}
          onDelete={() => handleDeleteEvaluation(detailEval.id)}
          isAdmin={isAdmin}
        />
      )}

      {/* ── Create Evaluation Modal ── */}
      {showCreate && (
        <CreateEvaluationModal
          templates={templates.filter((t) => t.isActive)}
          staffUsers={staffUsers}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false)
            await refreshEvaluations()
          }}
        />
      )}

      {/* ── Template Builder Modal ── */}
      {showTemplateBuilder && isAdmin && (
        <TemplateBuilderModal
          template={templateToEdit}
          onClose={() => {
            setShowTemplateBuilder(false)
            setTemplateToEdit(null)
          }}
          onSaved={async () => {
            setShowTemplateBuilder(false)
            setTemplateToEdit(null)
            await refreshTemplates()
          }}
        />
      )}

      <style>{`
        .eval-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }
        .eval-tab {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 99px;
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--text-muted);
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          cursor: pointer;
          transition: all var(--transition-smooth);
        }
        .eval-tab:hover {
          color: var(--text-primary);
          border-color: var(--border-default);
        }
        .eval-tab.active {
          color: var(--text-primary);
          border-color: var(--brand);
          background: rgba(99,102,241,0.12);
          box-shadow: 0 0 12px rgba(99,102,241,0.15);
        }
        .eval-tab-count {
          min-width: 20px;
          height: 20px;
          padding: 0 7px;
          border-radius: 99px;
          background: var(--bg-overlay);
          font-size: 0.6875rem;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .eval-tab.active .eval-tab-count {
          background: rgba(99,102,241,0.22);
          color: var(--brand-light);
        }
        .eval-card {
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .eval-card:hover {
          transform: translateY(-2px);
        }
        .eval-meta-row {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.8125rem;
          color: var(--text-muted);
        }
        .eval-meta-row strong {
          color: var(--text-secondary);
          font-weight: 500;
        }
        .criterion-row {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 14px 16px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          transition: border-color var(--transition);
        }
        .criterion-row:hover {
          border-color: var(--border-default);
        }
        .criterion-label {
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .criterion-description {
          font-size: 0.8125rem;
          color: var(--text-muted);
          line-height: 1.45;
        }
        .criterion-comment-input {
          margin-top: 4px;
          width: 100%;
          padding: 8px 12px;
          background: var(--bg-overlay);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 0.8125rem;
          outline: none;
          transition: border-color var(--transition);
          resize: vertical;
          min-height: 40px;
        }
        .criterion-comment-input:focus {
          border-color: var(--brand);
          box-shadow: 0 0 0 3px var(--brand-glow);
        }
        .eval-wide-modal {
          max-width: 720px;
        }
        .private-ribbon {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 9px;
          border-radius: 99px;
          background: rgba(245, 158, 11, 0.15);
          color: var(--warning);
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .ack-ribbon {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 9px;
          border-radius: 99px;
          background: rgba(16, 185, 129, 0.15);
          color: var(--success);
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .spin { animation: spin 0.7s linear infinite; }
        .template-card {
          display: flex;
          flex-direction: column;
          gap: 10px;
          cursor: default;
        }

        /* ── Document attachments ─────────────────────── */
        .doc-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px 6px 12px;
          background: var(--bg-overlay);
          border: 1px solid var(--border-default);
          border-radius: 99px;
          font-size: 0.8125rem;
          color: var(--text-secondary);
          max-width: 100%;
        }
        .doc-pill-name {
          color: var(--brand-light);
          text-decoration: none;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 220px;
        }
        .doc-pill-name:hover { text-decoration: underline; }
        .doc-pill-size {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .doc-attachment-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          text-decoration: none;
          color: inherit;
          transition: all var(--transition-smooth);
        }
        .doc-attachment-card:hover {
          border-color: var(--brand);
          background: var(--bg-hover);
          transform: translateY(-1px);
        }
        .doc-attachment-icon {
          width: 38px;
          height: 38px;
          border-radius: var(--radius-sm);
          background: var(--brand-gradient-subtle);
          color: var(--brand-light);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .doc-attachment-name {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .doc-attachment-meta {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 2px;
        }

        .template-doc-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          font-size: 0.75rem;
          color: var(--brand-light);
          background: var(--brand-gradient-subtle);
          border: 1px solid rgba(99,102,241,0.2);
          border-radius: var(--radius-sm);
          text-decoration: none;
          align-self: flex-start;
          max-width: 100%;
        }
        .template-doc-link:hover {
          border-color: rgba(99,102,241,0.4);
        }
        .template-doc-link span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 200px;
        }
      `}</style>
    </>
  )
}

// ── Evaluation card ──

function EvaluationCard({
  evaluation,
  currentUserId,
  index,
  onOpen,
}: {
  evaluation: Evaluation
  currentUserId: string
  index: number
  onOpen: () => void
}) {
  const e = evaluation
  const isMine = e.agentId === currentUserId
  const overall = e.overallRating ?? 0
  const needsAck = isMine && !e.acknowledgedAt && !e.isPrivate

  return (
    <div
      className="gradient-card eval-card animate-slide-up"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault()
          onOpen()
        }
      }}
      style={{ animationDelay: `${index * 35}ms` }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 4,
            }}
          >
            {e.template.name}
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {isMine ? `Review from ${e.evaluator.name || 'your supervisor'}` : e.agent.name || 'Unnamed agent'}
          </div>
        </div>
        {e.isPrivate && (
          <span className="private-ribbon" title="Only visible to evaluators and admins">
            <EyeOff size={11} /> Private
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <StarRow value={overall} max={5} readOnly size={16} />
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          {overall ? `${overall}.0 overall` : 'Unrated'}
        </span>
      </div>

      <div className="eval-meta-row">
        <Avatar user={isMine ? e.evaluator : e.agent} size={26} />
        <span>
          <strong>{isMine ? e.evaluator.name : e.agent.name}</strong> · {timeAgo(e.createdAt)}
        </span>
      </div>

      {e.comments && (
        <p
          style={{
            fontSize: '0.8125rem',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {e.comments}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {e.acknowledgedAt ? (
          <span className="ack-ribbon">
            <CheckCircle2 size={11} /> Acknowledged
          </span>
        ) : needsAck ? (
          <span className="badge badge-warning">Needs acknowledgement</span>
        ) : null}
        <span className="badge badge-muted">{e.scores.length} criteria</span>
      </div>
    </div>
  )
}

// ── Templates grid ──

function TemplatesGrid({
  templates,
  isAdmin,
  onEdit,
  onDelete,
}: {
  templates: Template[]
  isAdmin: boolean
  onEdit: (t: Template) => void
  onDelete: (id: string) => void
}) {
  const activeTemplates = templates.filter((t) => t.isActive)
  if (activeTemplates.length === 0) {
    return (
      <div className="empty-state">
        <ClipboardCheck size={44} />
        <p>No templates yet. Create one to get started.</p>
      </div>
    )
  }
  return (
    <div className="eval-grid">
      {activeTemplates.map((t, i) => (
        <div
          key={t.id}
          className="glass-card template-card animate-slide-up"
          style={{ animationDelay: `${i * 35}ms` }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h3 style={{ marginBottom: 4 }}>{t.name}</h3>
              {t.description && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{t.description}</p>
              )}
            </div>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className="btn btn-icon btn-ghost focus-ring"
                  onClick={() => onEdit(t)}
                  type="button"
                  aria-label="Edit template"
                  title="Edit"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  className="btn btn-icon btn-ghost focus-ring"
                  onClick={() => onDelete(t.id)}
                  type="button"
                  aria-label="Archive template"
                  title="Archive"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {t.criteria.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  background: 'var(--bg-overlay)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8125rem',
                }}
              >
                <span style={{ color: 'var(--text-secondary)' }}>{c.label}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>1 – {c.maxScore}</span>
              </div>
            ))}
          </div>
          {t.documentUrl && (
            <a
              href={t.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="template-doc-link focus-ring"
            >
              <Paperclip size={12} />
              <span>{t.documentName ?? 'Reference form'}</span>
            </a>
          )}
          {typeof t._count?.evaluations === 'number' && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Used in {t._count.evaluations} {t._count.evaluations === 1 ? 'evaluation' : 'evaluations'}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Detail Modal ──

function EvaluationDetailModal({
  evaluation,
  currentUser,
  onClose,
  onAcknowledge,
  onDelete,
  isAdmin,
}: {
  evaluation: Evaluation
  currentUser: { id: string; role: string }
  onClose: () => void
  onAcknowledge: () => void
  onDelete: () => void
  isAdmin: boolean
}) {
  const e = evaluation
  const isMine = e.agentId === currentUser.id
  const canAcknowledge = isMine && !e.acknowledgedAt && !e.isPrivate
  const overall = e.overallRating ?? 0

  const sortedScores = [...e.scores].sort((a, b) => a.criterion.order - b.criterion.order)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal animate-scale-in eval-wide-modal"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div style={{ height: 3, background: 'var(--brand-gradient)', borderRadius: '24px 24px 0 0' }} />
        <div className="modal-header" style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 2,
              }}
            >
              {e.template.name}
            </div>
            <h3>{e.agent.name || 'Unnamed agent'}</h3>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Evaluated by {e.evaluator.name || 'unknown'} · {formatDateTime(e.createdAt)}
            </div>
          </div>
          <button className="btn btn-icon btn-ghost focus-ring" onClick={onClose} type="button" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '16px 18px',
              background: 'var(--brand-gradient-subtle)',
              border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <Award size={28} color="var(--brand-light)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 4 }}>
                Overall Rating
              </div>
              <StarRow value={overall} max={5} readOnly size={20} />
            </div>
            {e.isPrivate && (
              <span className="private-ribbon">
                <EyeOff size={11} /> Private
              </span>
            )}
            {e.acknowledgedAt && (
              <span className="ack-ribbon">
                <CheckCircle2 size={11} /> Acknowledged
              </span>
            )}
          </div>

          <div>
            <div className="label" style={{ marginBottom: 10 }}>
              Criteria
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sortedScores.map((s) => (
                <div key={s.id} className="criterion-row">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div className="criterion-label">{s.criterion.label}</div>
                      {s.criterion.description && (
                        <div className="criterion-description">{s.criterion.description}</div>
                      )}
                    </div>
                    <StarRow value={s.score} max={s.criterion.maxScore} readOnly size={15} />
                  </div>
                  {s.comment && (
                    <div
                      style={{
                        fontSize: '0.8125rem',
                        color: 'var(--text-secondary)',
                        padding: '8px 10px',
                        background: 'var(--bg-overlay)',
                        borderRadius: 'var(--radius-sm)',
                        borderLeft: '2px solid var(--brand)',
                      }}
                    >
                      {s.comment}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {e.comments && (
            <div>
              <div className="label">Overall Comments</div>
              <div
                style={{
                  padding: '12px 14px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.875rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {e.comments}
              </div>
            </div>
          )}

          {e.documentUrl && (
            <div>
              <div className="label">Attached Document</div>
              <a
                href={e.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={e.documentName ?? undefined}
                className="doc-attachment-card focus-ring"
              >
                <div className="doc-attachment-icon">
                  <FileText size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="doc-attachment-name">{e.documentName ?? 'Evaluation document'}</div>
                  {typeof e.documentSize === 'number' && (
                    <div className="doc-attachment-meta">{formatBytes(e.documentSize)}</div>
                  )}
                </div>
                <Download size={16} style={{ color: 'var(--text-muted)' }} />
              </a>
            </div>
          )}
        </div>

        <div
          className="modal-footer"
          style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--border-subtle)', justifyContent: 'space-between' }}
        >
          <div>
            {isAdmin && (
              <button className="btn btn-danger focus-ring" onClick={onDelete} type="button">
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost focus-ring" onClick={onClose} type="button">
              Close
            </button>
            {canAcknowledge && (
              <button className="btn btn-gradient focus-ring" onClick={onAcknowledge} type="button">
                <CheckCircle2 size={16} /> Acknowledge
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Create Evaluation Modal ──

function CreateEvaluationModal({
  templates,
  staffUsers,
  onClose,
  onCreated,
}: {
  templates: Template[]
  staffUsers: UserLite[]
  onClose: () => void
  onCreated: () => void
}) {
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? '')
  const [agentId, setAgentId] = useState<string>(staffUsers[0]?.id ?? '')
  const [overallRating, setOverallRating] = useState(0)
  const [comments, setComments] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [scores, setScores] = useState<Record<string, { score: number; comment: string }>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Attached document
  const [documentUrl, setDocumentUrl] = useState<string | null>(null)
  const [documentName, setDocumentName] = useState<string | null>(null)
  const [documentSize, setDocumentSize] = useState<number | null>(null)
  const [docUploading, setDocUploading] = useState(false)
  const docInputRef = useRef<HTMLInputElement>(null)

  async function handleDocUpload(file: File) {
    setDocUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/workryn/evaluations/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Upload failed')
      setDocumentUrl(data.url)
      setDocumentName(data.fileName)
      setDocumentSize(data.size)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setDocUploading(false)
    }
  }

  function handleDocRemove() {
    setDocumentUrl(null)
    setDocumentName(null)
    setDocumentSize(null)
  }

  const template = templates.find((t) => t.id === templateId)

  function setScore(criterionId: string, score: number) {
    setScores((s) => ({ ...s, [criterionId]: { score, comment: s[criterionId]?.comment ?? '' } }))
  }
  function setScoreComment(criterionId: string, comment: string) {
    setScores((s) => ({ ...s, [criterionId]: { score: s[criterionId]?.score ?? 0, comment } }))
  }

  const canSubmit =
    !!templateId &&
    !!agentId &&
    !!template &&
    template.criteria.every((c) => {
      const v = scores[c.id]?.score ?? 0
      return v >= 1 && v <= c.maxScore
    }) &&
    overallRating >= 1 &&
    overallRating <= 5

  async function handleSubmit() {
    if (!canSubmit || !template) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/workryn/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          agentId,
          overallRating,
          comments: comments.trim(),
          isPrivate,
          documentUrl,
          documentName,
          documentSize,
          scores: template.criteria.map((c) => ({
            criterionId: c.id,
            score: scores[c.id]?.score ?? 0,
            comment: scores[c.id]?.comment?.trim() || null,
          })),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to save evaluation')
      }
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save evaluation')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-scale-in eval-wide-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ height: 3, background: 'var(--brand-gradient)', borderRadius: '24px 24px 0 0' }} />
        <div className="modal-header" style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3>New Evaluation</h3>
          <button className="btn btn-icon btn-ghost focus-ring" onClick={onClose} type="button" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
              <label className="label">Template *</label>
              <select
                className="input focus-ring"
                value={templateId}
                onChange={(e) => {
                  setTemplateId(e.target.value)
                  setScores({})
                }}
              >
                <option value="" disabled>
                  Select a template…
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
              <label className="label">Agent to evaluate *</label>
              <select
                className="input focus-ring"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              >
                <option value="" disabled>
                  Select a staff member…
                </option>
                {staffUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email || u.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {template && (
            <div>
              <div className="label" style={{ marginBottom: 10 }}>
                Score each criterion
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {template.criteria.map((c) => (
                  <div key={c.id} className="criterion-row">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div className="criterion-label">{c.label}</div>
                        {c.description && <div className="criterion-description">{c.description}</div>}
                      </div>
                      <StarRow
                        value={scores[c.id]?.score ?? 0}
                        max={c.maxScore}
                        onChange={(n) => setScore(c.id, n)}
                        size={18}
                      />
                    </div>
                    <textarea
                      className="criterion-comment-input"
                      placeholder="Optional comment…"
                      value={scores[c.id]?.comment ?? ''}
                      onChange={(e) => setScoreComment(c.id, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div
            style={{
              padding: '16px 18px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div>
              <div className="label">Overall rating *</div>
              <StarRow value={overallRating} max={5} onChange={setOverallRating} size={22} />
            </div>
            <div className="form-group">
              <label className="label">Overall comments</label>
              <textarea
                className="input focus-ring"
                style={{ minHeight: 90, resize: 'vertical' }}
                placeholder="Summary, strengths, areas for growth…"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
              />
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '0.875rem',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              <EyeOff size={14} /> Mark as private (only visible to you and admins)
            </label>

            <div className="form-group" style={{ marginTop: 4 }}>
              <label className="label">Attached document (optional)</label>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 8px' }}>
                Upload a scanned or completed evaluation form. PDF, Word, Excel, or image up to 25 MB.
              </p>
              {documentUrl ? (
                <div className="doc-pill">
                  <FileText size={14} />
                  <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="doc-pill-name">
                    {documentName ?? 'Document'}
                  </a>
                  {typeof documentSize === 'number' && (
                    <span className="doc-pill-size">{formatBytes(documentSize)}</span>
                  )}
                  <button
                    type="button"
                    className="btn btn-icon btn-ghost btn-sm focus-ring"
                    onClick={handleDocRemove}
                    aria-label="Remove document"
                    title="Remove"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost focus-ring"
                  onClick={() => docInputRef.current?.click()}
                  disabled={docUploading}
                >
                  {docUploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                  {docUploading ? 'Uploading…' : 'Upload document'}
                </button>
              )}
              <input
                ref={docInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.odt,.ods,.rtf,.txt,.png,.jpg,.jpeg,.webp,.tiff,.tif"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleDocUpload(f)
                  e.target.value = ''
                }}
              />
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: '10px 12px',
                background: 'rgba(239,68,68,0.1)',
                color: 'var(--danger)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8125rem',
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--border-subtle)' }}>
          <button className="btn btn-ghost focus-ring" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn btn-gradient focus-ring"
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            type="button"
          >
            {saving ? <Loader2 size={16} className="spin" /> : <Eye size={16} />} Save Evaluation
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Template Builder Modal ──

type DraftCriterion = {
  id?: string
  label: string
  description: string
  maxScore: number
}

function TemplateBuilderModal({
  template,
  onClose,
  onSaved,
}: {
  template: Template | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [criteria, setCriteria] = useState<DraftCriterion[]>(
    template?.criteria.map((c) => ({
      id: c.id,
      label: c.label,
      description: c.description ?? '',
      maxScore: c.maxScore,
    })) ?? [
      { label: '', description: '', maxScore: 5 },
    ],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reference document state
  const [documentUrl, setDocumentUrl] = useState<string | null>(template?.documentUrl ?? null)
  const [documentName, setDocumentName] = useState<string | null>(template?.documentName ?? null)
  const [documentSize, setDocumentSize] = useState<number | null>(template?.documentSize ?? null)
  const [docUploading, setDocUploading] = useState(false)
  const docInputRef = useRef<HTMLInputElement>(null)

  async function handleDocUpload(file: File) {
    setDocUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/workryn/evaluations/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Upload failed')
      setDocumentUrl(data.url)
      setDocumentName(data.fileName)
      setDocumentSize(data.size)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setDocUploading(false)
    }
  }

  function handleDocRemove() {
    setDocumentUrl(null)
    setDocumentName(null)
    setDocumentSize(null)
  }

  function addCriterion() {
    setCriteria((c) => [...c, { label: '', description: '', maxScore: 5 }])
  }
  function removeCriterion(i: number) {
    setCriteria((c) => c.filter((_, idx) => idx !== i))
  }
  function updateCriterion(i: number, patch: Partial<DraftCriterion>) {
    setCriteria((c) => c.map((item, idx) => (idx === i ? { ...item, ...patch } : item)))
  }
  function move(i: number, dir: -1 | 1) {
    setCriteria((c) => {
      const next = [...c]
      const target = i + dir
      if (target < 0 || target >= next.length) return next
      ;[next[i], next[target]] = [next[target], next[i]]
      return next
    })
  }

  const canSubmit = name.trim().length > 0 && criteria.every((c) => c.label.trim().length > 0)

  async function handleSubmit() {
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        criteria: criteria.map((c, i) => ({
          label: c.label.trim(),
          description: c.description.trim() || null,
          order: i,
          maxScore: c.maxScore,
        })),
        documentUrl,
        documentName,
        documentSize,
      }
      const url = template ? `/api/evaluations/templates/${template.id}` : '/api/evaluations/templates'
      const method = template ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to save template')
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-scale-in eval-wide-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ height: 3, background: 'var(--brand-gradient)', borderRadius: '24px 24px 0 0' }} />
        <div className="modal-header" style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3>{template ? 'Edit Template' : 'New Template'}</h3>
          <button className="btn btn-icon btn-ghost focus-ring" onClick={onClose} type="button" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="label">Template name *</label>
            <input
              className="input focus-ring"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Quarterly Performance Review"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="label">Description</label>
            <textarea
              className="input focus-ring"
              style={{ minHeight: 60, resize: 'vertical' }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional: when this template should be used."
            />
          </div>

          <div className="form-group">
            <label className="label">Reference document (optional)</label>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 8px' }}>
              Attach the form your team normally uses (PDF, Word, Excel, image). Up to 25 MB.
            </p>
            {documentUrl ? (
              <div className="doc-pill">
                <FileText size={14} />
                <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="doc-pill-name">
                  {documentName ?? 'Document'}
                </a>
                {typeof documentSize === 'number' && (
                  <span className="doc-pill-size">{formatBytes(documentSize)}</span>
                )}
                <button
                  type="button"
                  className="btn btn-icon btn-ghost btn-sm focus-ring"
                  onClick={handleDocRemove}
                  aria-label="Remove document"
                  title="Remove"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-ghost focus-ring"
                onClick={() => docInputRef.current?.click()}
                disabled={docUploading}
              >
                {docUploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                {docUploading ? 'Uploading…' : 'Upload document'}
              </button>
            )}
            <input
              ref={docInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.odt,.ods,.rtf,.txt,.png,.jpg,.jpeg,.webp,.tiff,.tif"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleDocUpload(f)
                e.target.value = ''
              }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div className="label" style={{ margin: 0 }}>
                Criteria
              </div>
              <button className="btn btn-ghost btn-sm focus-ring" onClick={addCriterion} type="button">
                <Plus size={14} /> Add
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {criteria.map((c, i) => (
                <div key={c.id ?? i} className="criterion-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <input
                        className="input focus-ring"
                        placeholder="Criterion label (e.g. Communication)"
                        value={c.label}
                        onChange={(e) => updateCriterion(i, { label: e.target.value })}
                        style={{ height: 36, fontSize: '0.875rem' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>1 –</span>
                      <input
                        className="input focus-ring"
                        type="number"
                        min={1}
                        max={10}
                        value={c.maxScore}
                        onChange={(e) =>
                          updateCriterion(i, { maxScore: Math.max(1, Math.min(10, Number(e.target.value) || 5)) })
                        }
                        style={{ width: 64, height: 36, fontSize: '0.875rem' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button
                        className="btn btn-icon btn-ghost focus-ring"
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        aria-label="Move up"
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        className="btn btn-icon btn-ghost focus-ring"
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={i === criteria.length - 1}
                        aria-label="Move down"
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button
                        className="btn btn-icon btn-ghost focus-ring"
                        type="button"
                        onClick={() => removeCriterion(i)}
                        disabled={criteria.length <= 1}
                        aria-label="Remove criterion"
                        title="Remove"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                  <textarea
                    className="criterion-comment-input"
                    placeholder="Optional description for this criterion"
                    value={c.description}
                    onChange={(e) => updateCriterion(i, { description: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: '10px 12px',
                background: 'rgba(239,68,68,0.1)',
                color: 'var(--danger)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8125rem',
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--border-subtle)' }}>
          <button className="btn btn-ghost focus-ring" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn btn-gradient focus-ring"
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            type="button"
          >
            {saving ? <Loader2 size={16} className="spin" /> : <ClipboardCheck size={16} />} Save Template
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useMemo, useRef, useState, useEffect } from 'react'
import MilestoneDashboard from './MilestoneDashboard'
import {
  Avatar as MAvatar,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Tabs as MTabs,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import PageBanner from '@/components/workryn/PageBanner'
import { useCountUp } from '@/hooks/useCountUp'
import { useTilt, useMouseSpotlight } from '@/hooks/workrynEffects'
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
  TrendingUp,
  BarChart3,
  Users,
  Clock,
  Sparkles,
  Target,
  Zap,
  BookOpen,
  MessageSquare,
  ToggleLeft,
  Search,
  PieChart,
  Info,
  Send,
} from 'lucide-react'
import { formatDateTime, timeAgo, getInitials } from '@/lib/workryn/utils'
import { canManageEvaluations, canViewEvaluations } from '@/lib/workryn/permissions'
import { ANIM } from '@/lib/animations'

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
  type?: string // RATING | TEXT | YES_NO | COMMENT
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
  currentUser: { id: string; name: string; role: string; avatarColor: string; hireDate?: string }
}

type Tab = 'received' | 'given' | 'all' | 'templates' | 'question-bank'

// ── Employment milestone → template matcher ─────────────────
// Returns the single self-assessment template appropriate for this user's tenure.

function getApplicableTemplate(templates: Template[], hireDate?: string): Template | null {
  if (!hireDate) return null
  const daysSinceHire = Math.floor((Date.now() - new Date(hireDate).getTime()) / (1000 * 60 * 60 * 24))
  const active = templates.filter(t => t.isActive)

  // Determine which milestone they're at or approaching
  // Show the template for the current or next upcoming milestone
  type Milestone = { maxDays: number; keywords: string[] }
  const milestones: Milestone[] = [
    { maxDays: 15, keywords: ['10-Day', '10 Day', '10 Days'] },
    { maxDays: 45, keywords: ['30-Day', '30 Day', '30 Days'] },
    { maxDays: 120, keywords: ['90-Day', '90 Day', '90 Days'] },
    { maxDays: 210, keywords: ['6-Month', '6 Month'] },
    { maxDays: 395, keywords: ['1-Year', '1 Year', 'Annual Self'] },
    { maxDays: Infinity, keywords: ['Annual Self', 'Annual Competency'] },
  ]

  for (const milestone of milestones) {
    if (daysSinceHire <= milestone.maxDays) {
      const match = active.find(t =>
        milestone.keywords.some(kw => t.name.includes(kw)) &&
        (t.name.toLowerCase().includes('self') || t.name.toLowerCase().includes('check') || t.name.toLowerCase().includes('call') || t.name.toLowerCase().includes('inquiry'))
      )
      if (match) return match
    }
  }

  return null
}

function getDaysSinceHire(hireDate?: string): number {
  if (!hireDate) return 0
  return Math.floor((Date.now() - new Date(hireDate).getTime()) / (1000 * 60 * 60 * 24))
}

function getMilestoneLabel(days: number): string {
  if (days <= 15) return '10-Day'
  if (days <= 45) return '30-Day'
  if (days <= 120) return '90-Day'
  if (days <= 210) return '6-Month'
  if (days <= 395) return '1-Year'
  return 'Annual'
}

// ── Small primitives ─────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/* ── Animated Count-Up imported from @/hooks/useCountUp ── */

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

/* ── Score Bar Visualization ── */
function ScoreBar({ score, max, color = '#3b82f6' }: { score: number; max: number; color?: string }) {
  const pct = max > 0 ? (score / max) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
      <div style={{
        flex: 1, height: 6, borderRadius: 3,
        background: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 3,
          background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          transition: 'width 600ms cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: `0 0 8px ${color}44`,
        }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color, minWidth: 28, textAlign: 'right' }}>
        {score}/{max}
      </span>
    </div>
  )
}

/* ── Rating color helper ── */
function ratingColor(rating: number): string {
  if (rating >= 4) return '#10b981'
  if (rating >= 3) return '#f59e0b'
  if (rating >= 2) return '#f97316'
  return '#ef4444'
}

/* ── Stat Card for top row ── */
function StatCard({ icon: Icon, label, value, color, delay = 0 }: {
  icon: typeof Award; label: string; value: number | string; color: string; delay?: number
}) {
  const numVal = typeof value === 'number' ? useCountUp(value, 900) : value

  return (
    <div className="eval-stat-card animate-slide-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="eval-stat-icon" style={{ background: `${color}18`, color }}>
        <Icon size={22} />
      </div>
      <div>
        <div className="eval-stat-value">{numVal}</div>
        <div className="eval-stat-label">{label}</div>
      </div>
    </div>
  )
}

// ── Main client component ───────────────────────────────────

export default function EvaluationsClient({
  initialEvaluations,
  initialTemplates,
  users,
  currentUser,
  bannerUrl,
}: Props & { bannerUrl?: string | null }) {
  const [evaluations, setEvaluations] = useState<Evaluation[]>(initialEvaluations)
  const [templates, setTemplates] = useState<Template[]>(initialTemplates)
  const isManager = canViewEvaluations(currentUser.role)
  const isAdmin = canManageEvaluations(currentUser.role)
  const spot = useMouseSpotlight()

  const [tab, setTab] = useState<Tab>(isManager ? 'given' : 'received')
  const [detailEval, setDetailEval] = useState<Evaluation | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false)
  const [templateToEdit, setTemplateToEdit] = useState<Template | null>(null)
  const [showSelfAssessment, setShowSelfAssessment] = useState(false)

  // ── Filters per tab ──
  const visible = useMemo(() => {
    if (!isManager) {
      return evaluations.filter((e) => e.agentId === currentUser.id)
    }
    if (tab === 'received') {
      return evaluations.filter((e) => e.agentId === currentUser.id && !e.isPrivate)
    }
    if (tab === 'given') {
      return evaluations.filter((e) => e.evaluatorId === currentUser.id)
    }
    return evaluations
  }, [evaluations, tab, isManager, currentUser.id])

  const staffUsers = useMemo(
    () => users.filter((u) => u.role === 'STAFF' && u.id !== currentUser.id),
    [users, currentUser.id],
  )

  // ── Stats ──
  const avgRating = useMemo(() => {
    const rated = evaluations.filter(e => e.overallRating && e.overallRating > 0)
    if (rated.length === 0) return '—'
    const sum = rated.reduce((a, e) => a + (e.overallRating || 0), 0)
    return (sum / rated.length).toFixed(1)
  }, [evaluations])

  const pendingAck = useMemo(
    () => evaluations.filter(e => e.agentId === currentUser.id && !e.acknowledgedAt && !e.isPrivate).length,
    [evaluations, currentUser.id],
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

  // ── Tab config ──
  const givenCount = evaluations.filter((e) => e.evaluatorId === currentUser.id).length
  const receivedCount = evaluations.filter((e) => e.agentId === currentUser.id && !e.isPrivate).length
  const activeTemplateCount = templates.filter((t) => t.isActive).length

  type TabConfig = { id: Tab; label: string; icon: typeof Award; count: number }
  const totalCriteria = templates.reduce((sum, t) => sum + t.criteria.length, 0)
  const tabs: TabConfig[] = isManager
    ? [
        { id: 'given', label: 'Onboarding', icon: TrendingUp, count: staffUsers.length },
        { id: 'received', label: 'My Reviews', icon: Star, count: receivedCount },
        ...(isAdmin ? [
          { id: 'all' as Tab, label: 'All Staff', icon: Users, count: evaluations.length },
          { id: 'templates' as Tab, label: 'Templates', icon: ClipboardCheck, count: activeTemplateCount },
          { id: 'question-bank' as Tab, label: 'Question Bank', icon: BookOpen, count: totalCriteria },
        ] : []),
      ]
    : []

  // Count-ups for hero/stats
  const animTotal       = useCountUp(evaluations.length, 800)
  const animPending     = useCountUp(pendingAck, 800)
  const animTemplates   = useCountUp(activeTemplateCount, 800)

  return (
    <Container size="xl" py="lg" w="100%" className="eva-root">
      {/* ============ AURORA HERO ============ */}
      {bannerUrl ? (
        <>
          <PageBanner bannerUrl={bannerUrl} anim={ANIM.heroEvaluations} />
          <Group justify="flex-end" mb="lg">
            {!isManager && getApplicableTemplate(templates, currentUser.hireDate) && (
              <Button size="md" leftSection={<Edit2 size={16} />} onClick={() => setShowSelfAssessment(true)} className="eva-btn-primary">Start {getMilestoneLabel(getDaysSinceHire(currentUser.hireDate))} Self-Assessment</Button>
            )}
            {isAdmin && tab === 'templates' && (
              <Button size="md" leftSection={<Plus size={16} />} onClick={() => { setTemplateToEdit(null); setShowTemplateBuilder(true) }} className="eva-btn-primary">New Template</Button>
            )}
          </Group>
        </>
      ) : (
      <div ref={spot.ref} onMouseMove={spot.onMouseMove} style={{ marginBottom: 20 }}>
        <Paper radius="lg" p="xl" className="eva-hero">
          <div className="eva-hero-mesh" aria-hidden />
          <div className="eva-hero-orbs" aria-hidden>
            <span className="eva-orb eva-orb-1" />
            <span className="eva-orb eva-orb-2" />
            <span className="eva-orb eva-orb-3" />
          </div>
          <div className="eva-hero-spotlight" aria-hidden />

            <img src="/heroes/evaluations.svg" alt="" aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", height: "70%", zIndex: 0, opacity: 0.22, pointerEvents: "none" }} />

          <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg" style={{ position: 'relative', zIndex: 2 }}>
            <Stack gap={6} style={{ minWidth: 0, flex: 1 }}>
              <Group gap={8} align="center">
                <Award size={14} style={{ color: 'rgba(240,171,252,0.9)' }} />
                <Text size="xs" tt="uppercase" fw={700} c="grape.3" style={{ letterSpacing: '0.12em' }}>
                  Performance Evaluations
                </Text>
              </Group>
              <Title order={1} className="eva-hero-title">
                {animTotal} {animTotal === 1 ? 'evaluation' : 'evaluations'}
              </Title>
              <Text size="sm" c="dimmed">
                {isManager
                  ? `Review and author performance evaluations for your team.${pendingAck > 0 ? ` ${pendingAck} pending acknowledgement.` : ''}`
                  : 'Complete self-assessments and view evaluations from your supervisor.'}
              </Text>
              <Group gap="xs" mt="sm">
                {!isManager && getApplicableTemplate(templates, currentUser.hireDate) && (
                  <Button
                    size="md"
                    leftSection={<Edit2 size={16} />}
                    onClick={() => setShowSelfAssessment(true)}
                    className="eva-btn-primary"
                  >
                    Start {getMilestoneLabel(getDaysSinceHire(currentUser.hireDate))} Self-Assessment
                  </Button>
                )}
                {isAdmin && tab === 'templates' && (
                  <Button
                    size="md"
                    leftSection={<Plus size={16} />}
                    onClick={() => { setTemplateToEdit(null); setShowTemplateBuilder(true) }}
                    className="eva-btn-primary"
                  >
                    New Template
                  </Button>
                )}
              </Group>
            </Stack>
          </Group>
        </Paper>
      </div>
      )}

      {/* ============ STAT CARDS ============ */}
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm" mb="md">
        <EvaStatCard label="Total Evaluations" value={String(animTotal)}     icon={BarChart3}      theme="fuchsia" delay={0}   />
        <EvaStatCard label="Avg Rating"        value={avgRating}              icon={Star}           theme="amber"   delay={80}  />
        <EvaStatCard label="Pending Review"    value={String(animPending)}    icon={Clock}          theme={pendingAck > 0 ? 'red' : 'mint'} delay={160} />
        <EvaStatCard label="Active Templates"  value={String(animTemplates)}  icon={ClipboardCheck} theme="violet"  delay={240} />
      </SimpleGrid>

      {/* ============ TAB BAR ============ */}
      {isManager && (
        <Card radius="lg" p={0} withBorder className="eva-tabs-wrap" mb="md">
          <MTabs value={tab} onChange={(v) => v && setTab(v as Tab)} classNames={{ list: 'eva-tabs-list' }}>
            <MTabs.List>
              {tabs.map((t) => (
                <MTabs.Tab
                  key={t.id}
                  value={t.id}
                  leftSection={<t.icon size={14} />}
                  rightSection={
                    <Badge size="xs" variant="light" color={tab === t.id ? 'grape' : 'gray'}>
                      {t.count}
                    </Badge>
                  }
                >
                  {t.label}
                </MTabs.Tab>
              ))}
            </MTabs.List>
          </MTabs>
        </Card>
      )}

      {/* Existing content + modals continue below, unchanged */}

      {/* ── Content ── */}
      <div className="eval-content">
        {tab === 'question-bank' && isAdmin ? (
          <QuestionBankView templates={templates} />
        ) : tab === 'templates' && isAdmin ? (
          <TemplatesGrid
            templates={templates}
            isAdmin={isAdmin}
            onEdit={(t) => { setTemplateToEdit(t); setShowTemplateBuilder(true) }}
            onDelete={handleDeleteTemplate}
          />
        ) : isManager && (tab === 'given' || tab === 'all') ? (
          /* ── Manager view: Milestone Dashboard ── */
          <MilestoneDashboard />
        ) : (
          /* ── Staff view: Self-Assessment + Supervisor Reviews ── */
          <>
            {(() => {
              const selfEvals = evaluations.filter(e => e.agentId === currentUser.id && e.evaluatorId === currentUser.id && e.comments?.startsWith('[SELF-ASSESSMENT]'))
              const supervisorEvals = visible.filter(e => !(e.agentId === currentUser.id && e.evaluatorId === currentUser.id && e.comments?.startsWith('[SELF-ASSESSMENT]')))

              return (
                <>
                  {/* CTA for staff who haven't submitted yet */}
                  {!isManager && selfEvals.length === 0 && getApplicableTemplate(templates, currentUser.hireDate) && (
                    <div className="sa-cta-panel animate-slide-up" style={{ marginBottom: 28 }}>
                      <div className="sa-cta-left">
                        <div className="sa-cta-icon"><Edit2 size={24} /></div>
                        <div>
                          <h3 className="sa-cta-title">Complete Your {getMilestoneLabel(getDaysSinceHire(currentUser.hireDate))} Self-Assessment</h3>
                          <p className="sa-cta-desc">
                            You are <strong>Day {getDaysSinceHire(currentUser.hireDate)}</strong> of your employment.
                            Complete and submit your self-assessment questionnaire
                            <strong> at least one week before</strong> your scheduled meeting with Sarah Abbott.
                          </p>
                        </div>
                      </div>
                      <button className="btn btn-gradient focus-ring" onClick={() => setShowSelfAssessment(true)} type="button" style={{ whiteSpace: 'nowrap' }}>
                        <Edit2 size={16} /> Begin Self-Assessment
                      </button>
                    </div>
                  )}

                  {/* Submitted self-assessments */}
                  {selfEvals.length > 0 && (
                    <div style={{ marginBottom: 28 }}>
                      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Edit2 size={16} style={{ color: '#10b981' }} /> My Self-Assessments
                      </h2>
                      <div className="eval-grid">
                        {selfEvals.map((e, i) => (
                          <div
                            key={e.id}
                            className="gradient-card eval-card animate-slide-up"
                            onClick={() => setDetailEval(e)}
                            role="button" tabIndex={0}
                            onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setDetailEval(e) } }}
                            style={{ animationDelay: `${i * 50}ms` }}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                              <div>
                                <div className="eval-card-template">{e.template.name}</div>
                                <div className="eval-card-title">Self-Assessment</div>
                              </div>
                              <span className="ack-ribbon"><CheckCircle2 size={11} /> Submitted</span>
                            </div>
                            <div className="eval-meta-row">
                              <Clock size={13} />
                              <span>{new Date(e.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            </div>
                            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                              {e.scores.length} question{e.scores.length !== 1 ? 's' : ''} answered
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Supervisor reviews */}
                  {supervisorEvals.length > 0 && (
                    <div>
                      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Award size={16} style={{ color: '#3b82f6' }} /> Supervisor Reviews
                      </h2>
                      <div className="eval-grid">
                        {supervisorEvals.map((e, i) => (
                          <EvaluationCard key={e.id} evaluation={e} currentUserId={currentUser.id} index={i} onOpen={() => setDetailEval(e)} />
                        ))}
                      </div>
                    </div>
                  )}

                  {selfEvals.length === 0 && supervisorEvals.length === 0 && !getApplicableTemplate(templates, currentUser.hireDate) && (
                    <EmptyEvalState isManager={isManager} tab={tab} />
                  )}
                </>
              )
            })()}
          </>
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
          onCreated={async () => { setShowCreate(false); await refreshEvaluations() }}
        />
      )}

      {/* ── Template Builder Modal ── */}
      {showTemplateBuilder && isAdmin && (
        <TemplateBuilderModal
          template={templateToEdit}
          onClose={() => { setShowTemplateBuilder(false); setTemplateToEdit(null) }}
          onSaved={async () => { setShowTemplateBuilder(false); setTemplateToEdit(null); await refreshTemplates() }}
        />
      )}

      {/* ── Self-Assessment Modal ── */}
      {showSelfAssessment && (
        <SelfAssessmentModal
          templates={(() => {
            const applicable = getApplicableTemplate(templates, currentUser.hireDate)
            return applicable ? [applicable] : []
          })()}
          allTemplates={[]}
          currentUser={currentUser}
          onClose={() => setShowSelfAssessment(false)}
          onSubmitted={async () => { setShowSelfAssessment(false); await refreshEvaluations() }}
        />
      )}

      <style>{`
        /* ── Page Layout ── */
        .eval-page-header { padding: 28px 32px 0; }
        .eval-header-top {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 16px; margin-bottom: 24px;
        }
        .eval-title {
          display: flex; align-items: center; gap: 10px;
          font-size: 1.5rem; margin-bottom: 6px;
        }
        .eval-subtitle { font-size: 0.875rem; color: var(--text-muted); margin: 0; }
        .eval-content { padding: 24px 32px 32px; }

        /* ── Stats Row ── */
        .eval-stats-row {
          display: grid; grid-template-columns: repeat(4, 1fr);
          gap: 16px; margin-bottom: 28px;
        }
        @media (max-width: 1000px) { .eval-stats-row { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 540px) { .eval-stats-row { grid-template-columns: 1fr; } }
        .eval-stat-card {
          display: flex; flex-direction: column; gap: 16px;
          padding: 24px 24px 22px;
          background: var(--glass-bg);
          backdrop-filter: var(--glass-blur);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          transition: all var(--transition-smooth);
          min-height: 130px;
        }
        .eval-stat-card:hover {
          border-color: var(--border-default);
          transform: translateY(-3px);
          box-shadow: 0 6px 28px rgba(0,0,0,0.25);
        }
        .eval-stat-icon {
          width: 48px; height: 48px; border-radius: var(--radius-md);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .eval-stat-value {
          font-size: 2rem; font-weight: 800; color: var(--text-primary);
          line-height: 1; letter-spacing: -0.02em;
        }
        .eval-stat-label {
          font-size: 0.8125rem; color: var(--text-muted); font-weight: 500; margin-top: 4px;
        }

        /* ── Tab Bar ── */
        .eval-tab-bar {
          display: flex; gap: 8px; flex-wrap: wrap;
          padding-bottom: 22px; border-bottom: 1px solid var(--border-subtle);
        }
        .eval-tab {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 20px; border-radius: 99px;
          font-size: 0.9375rem; font-weight: 500;
          color: var(--text-muted); background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          cursor: pointer; transition: all var(--transition-smooth);
        }
        .eval-tab:hover {
          color: var(--text-primary); border-color: var(--border-default);
          background: var(--bg-hover);
        }
        .eval-tab.active {
          color: var(--text-primary); border-color: var(--brand);
          background: rgba(37,99,235,0.12);
          box-shadow: 0 0 16px rgba(37,99,235,0.15);
        }
        .eval-tab-count {
          min-width: 22px; height: 22px; padding: 0 8px; border-radius: 99px;
          background: var(--bg-overlay); font-size: 0.75rem; font-weight: 700;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .eval-tab.active .eval-tab-count {
          background: rgba(37,99,235,0.22); color: var(--brand-light);
        }

        /* ── Card Grid ── */
        .eval-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }

        /* ── Evaluation Card ── */
        .eval-card {
          cursor: pointer; display: flex; flex-direction: column; gap: 14px;
          position: relative; overflow: hidden;
        }
        .eval-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: var(--brand-gradient); opacity: 0;
          transition: opacity var(--transition-smooth);
        }
        .eval-card:hover::before { opacity: 1; }
        .eval-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.3), 0 0 20px rgba(37,99,235,0.08);
        }
        .eval-card-template {
          font-size: 0.6875rem; font-weight: 700; color: var(--brand-light);
          text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px;
        }
        .eval-card-title { font-size: 1rem; font-weight: 600; color: var(--text-primary); }
        .eval-card-score-ring {
          width: 44px; height: 44px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .eval-card-score-inner {
          width: 36px; height: 36px; border-radius: 50%;
          background: var(--bg-elevated);
          display: flex; align-items: center; justify-content: center;
          font-size: 0.8125rem; font-weight: 800;
        }
        .eval-meta-row { display: flex; align-items: center; gap: 10px; font-size: 0.8125rem; color: var(--text-muted); }
        .eval-meta-row strong { color: var(--text-secondary); font-weight: 500; }
        .eval-card-scores {
          display: flex; flex-direction: column; gap: 6px;
          padding: 10px 12px; background: var(--bg-surface);
          border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);
        }
        .eval-card-score-item { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; }
        .eval-card-score-label {
          color: var(--text-muted); min-width: 80px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        /* ── Ribbons ── */
        .private-ribbon {
          display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px;
          border-radius: 99px; background: rgba(245, 158, 11, 0.15); color: var(--warning);
          font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
        }
        .ack-ribbon {
          display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px;
          border-radius: 99px; background: rgba(16, 185, 129, 0.15); color: var(--success);
          font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
        }
        .needs-ack-pulse { animation: pulse-glow 2s ease-in-out infinite; }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
          50% { box-shadow: 0 0 12px 2px rgba(239,68,68,0.25); }
        }

        /* ── Empty State ── */
        .eval-empty {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; padding: 64px 32px; text-align: center;
        }
        .eval-empty-icon {
          width: 80px; height: 80px; border-radius: 50%;
          background: linear-gradient(135deg, rgba(37,99,235,0.12), rgba(139,92,246,0.12));
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 20px; animation: float 4s ease-in-out infinite;
        }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .eval-empty h3 { font-size: 1.125rem; color: var(--text-primary); margin-bottom: 8px; }
        .eval-empty p {
          font-size: 0.875rem; color: var(--text-muted);
          max-width: 400px; line-height: 1.5; margin-bottom: 20px;
        }

        /* ── Detail Modal ── */
        .eval-wide-modal { max-width: 720px; }
        .eval-modal-rating-banner {
          display: flex; align-items: center; gap: 16px; padding: 18px 20px;
          background: var(--brand-gradient-subtle);
          border: 1px solid rgba(37,99,235,0.2); border-radius: var(--radius-md);
        }
        .eval-modal-rating-ring {
          width: 56px; height: 56px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .eval-modal-rating-inner {
          width: 44px; height: 44px; border-radius: 50%;
          background: var(--bg-elevated);
          display: flex; align-items: center; justify-content: center; font-weight: 800;
        }

        /* ── Criterion Row ── */
        .criterion-row {
          display: flex; flex-direction: column; gap: 10px;
          padding: 14px 16px; background: var(--bg-surface);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
          transition: border-color var(--transition);
        }
        .criterion-row:hover { border-color: var(--border-default); }
        .criterion-label { font-size: 0.9375rem; font-weight: 600; color: var(--text-primary); }
        .criterion-description { font-size: 0.8125rem; color: var(--text-muted); line-height: 1.45; }
        .criterion-comment-input {
          margin-top: 4px; width: 100%; padding: 8px 12px;
          background: var(--bg-overlay); border: 1px solid var(--border-default);
          border-radius: var(--radius-sm); color: var(--text-primary);
          font-size: 0.8125rem; outline: none;
          transition: border-color var(--transition);
          resize: vertical; min-height: 40px;
        }
        .criterion-comment-input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }

        /* ── Template Card ── */
        .template-card {
          display: flex; flex-direction: column; gap: 12px;
          cursor: default; position: relative; overflow: hidden;
        }
        .template-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0;
          height: 3px; background: linear-gradient(90deg, #8b5cf6, #a78bfa); opacity: 0.7;
        }
        .template-criteria-list { display: flex; flex-direction: column; gap: 6px; }
        .template-criterion-chip {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 12px; background: var(--bg-overlay);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);
          font-size: 0.8125rem; transition: all var(--transition);
        }
        .template-criterion-chip:hover { border-color: var(--border-default); background: var(--bg-hover); }

        /* ── Document attachments ── */
        .doc-pill {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 6px 10px 6px 12px; background: var(--bg-overlay);
          border: 1px solid var(--border-default); border-radius: 99px;
          font-size: 0.8125rem; color: var(--text-secondary); max-width: 100%;
        }
        .doc-pill-name {
          color: var(--brand-light); text-decoration: none; font-weight: 600;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px;
        }
        .doc-pill-name:hover { text-decoration: underline; }
        .doc-pill-size { font-size: 0.75rem; color: var(--text-muted); }
        .doc-attachment-card {
          display: flex; align-items: center; gap: 12px; padding: 12px 14px;
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md); text-decoration: none; color: inherit;
          transition: all var(--transition-smooth);
        }
        .doc-attachment-card:hover {
          border-color: var(--brand); background: var(--bg-hover); transform: translateY(-1px);
        }
        .doc-attachment-icon {
          width: 38px; height: 38px; border-radius: var(--radius-sm);
          background: var(--brand-gradient-subtle); color: var(--brand-light);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .doc-attachment-name {
          font-size: 0.875rem; font-weight: 600; color: var(--text-primary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .doc-attachment-meta { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
        .template-doc-link {
          display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px;
          font-size: 0.75rem; color: var(--brand-light);
          background: var(--brand-gradient-subtle);
          border: 1px solid rgba(37,99,235,0.2); border-radius: var(--radius-sm);
          text-decoration: none; align-self: flex-start; max-width: 100%;
        }
        .template-doc-link:hover { border-color: rgba(37,99,235,0.4); }
        .template-doc-link span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
        .spin { animation: spin 0.7s linear infinite; }

        /* ── Self-Assessment CTA Panel ── */
        .sa-cta-panel {
          display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
          padding: 24px; background: linear-gradient(135deg, rgba(16,185,129,0.06), rgba(37,99,235,0.06));
          border: 1px solid rgba(16,185,129,0.2); border-radius: var(--radius-lg);
        }
        .sa-cta-left { display: flex; align-items: flex-start; gap: 16px; flex: 1; min-width: 280px; }
        .sa-cta-icon {
          width: 48px; height: 48px; border-radius: 12px;
          background: rgba(16,185,129,0.15); color: #34d399;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .sa-cta-title { font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0 0 4px; }
        .sa-cta-desc { font-size: 0.875rem; color: var(--text-muted); margin: 0; line-height: 1.5; }
        .sa-cta-desc strong { color: var(--text-secondary); }

        /* ── Self-Assessment Form ── */
        .sa-form-section {
          display: flex; flex-direction: column; gap: 14px;
          padding: 16px; background: var(--bg-surface);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
        }
        .sa-question {
          padding: 14px 16px; background: var(--bg-overlay);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
          transition: border-color var(--transition);
        }
        .sa-question:hover { border-color: var(--border-default); }
        .sa-question-header {
          display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px;
        }
        .sa-question-num {
          width: 24px; height: 24px; border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.6875rem; font-weight: 800; flex-shrink: 0;
        }
        .sa-question-label { font-size: 0.9375rem; font-weight: 600; color: var(--text-primary); line-height: 1.45; }
        .sa-question-type {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 8px; border-radius: 4px; font-size: 0.6875rem;
          font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
          margin-left: auto; white-space: nowrap; flex-shrink: 0;
        }
        .sa-textarea {
          width: 100%; min-height: 70px; resize: vertical;
          padding: 10px 14px; background: var(--bg-surface);
          border: 1px solid var(--border-default); border-radius: var(--radius-sm);
          color: var(--text-primary); font-size: 0.875rem; outline: none;
          transition: border-color var(--transition);
          line-height: 1.55;
        }
        .sa-textarea:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-glow); }
        .sa-textarea::placeholder { color: var(--text-muted); }
        .sa-yn-btns { display: flex; gap: 8px; }
        .sa-yn-btn {
          padding: 8px 20px; border-radius: 8px; font-size: 0.875rem; font-weight: 600;
          border: 1px solid var(--border-default); background: var(--bg-surface);
          color: var(--text-muted); cursor: pointer; transition: all 0.15s;
        }
        .sa-yn-btn:hover { border-color: var(--border-default); background: var(--bg-hover); }
        .sa-yn-btn.active-yes { background: rgba(16,185,129,0.15); border-color: #10b981; color: #34d399; }
        .sa-yn-btn.active-no { background: rgba(239,68,68,0.15); border-color: #ef4444; color: #f87171; }
        .sa-progress { margin-bottom: 12px; }
        .sa-progress-bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.06); overflow: hidden; }
        .sa-progress-fill { height: 100%; border-radius: 3px; transition: width 300ms ease; }
        .sa-progress-text { font-size: 0.75rem; color: var(--text-muted); margin-top: 6px; text-align: right; }

        /* ============ AURORA HERO STYLES (fuchsia accent) ============ */
        @keyframes eva-slide-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes eva-mesh-drift {
          0%, 100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(3%, -2%) scale(1.05); }
        }
        @keyframes eva-orb-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(40px,-30px)} }
        @keyframes eva-orb-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,25px)} }
        @keyframes eva-orb-c { 0%,100%{transform:translate(0,0)} 50%{transform:translate(20px,40px)} }
        @media (prefers-reduced-motion: reduce) {
          .eva-root *, .eva-root *::before, .eva-root *::after {
            animation: none !important; transition: none !important;
          }
        }
        .eva-hero {
          position: relative; overflow: hidden;
          border: 1px solid rgba(217,70,239,0.32);
          background:
            linear-gradient(135deg, rgba(217,70,239,0.16) 0%, rgba(168,85,247,0.10) 50%, rgba(99,102,241,0.06) 100%),
            rgba(11,15,30,0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          box-shadow: 0 20px 60px -20px rgba(217,70,239,0.35), 0 1px 0 rgba(255,255,255,0.05) inset;
          animation: eva-slide-up 460ms ease-out backwards;
        }
        .eva-hero-mesh {
          position: absolute; inset: -25%;
          background:
            radial-gradient(circle at 22% 30%, rgba(217,70,239,0.45), transparent 42%),
            radial-gradient(circle at 78% 25%, rgba(168,85,247,0.30), transparent 47%),
            radial-gradient(circle at 62% 82%, rgba(99,102,241,0.18), transparent 52%);
          filter: blur(40px);
          animation: eva-mesh-drift 22s ease-in-out infinite;
          z-index: 0; pointer-events: none;
        }
        .eva-hero-orbs { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
        .eva-orb { position: absolute; border-radius: 50%; filter: blur(22px); opacity: 0.55; mix-blend-mode: screen; }
        .eva-orb-1 { width: 130px; height: 130px; top: 12%; left: 8%;
          background: radial-gradient(circle, #f0abfc 0%, transparent 70%);
          animation: eva-orb-a 14s ease-in-out infinite; }
        .eva-orb-2 { width: 100px; height: 100px; top: 55%; left: 60%;
          background: radial-gradient(circle, #D946EF 0%, transparent 70%);
          animation: eva-orb-b 16s ease-in-out infinite; }
        .eva-orb-3 { width: 80px; height: 80px; bottom: 10%; right: 12%;
          background: radial-gradient(circle, #818cf8 0%, transparent 70%);
          animation: eva-orb-c 18s ease-in-out infinite; }
        .eva-hero-spotlight {
          position: absolute; inset: 0; z-index: 1; pointer-events: none;
          background: radial-gradient(circle 360px at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.10), transparent 60%);
        }
        .eva-hero-title {
          font-size: clamp(2.25rem, 6vw, 4rem);
          font-weight: 800;
          letter-spacing: -0.035em;
          line-height: 1;
          margin: 0;
          font-variant-numeric: tabular-nums;
          background: linear-gradient(135deg, #ffffff 0%, #f0abfc 50%, #D946EF 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 2px 16px rgba(217,70,239,0.45));
        }
        .eva-btn-primary {
          background: linear-gradient(135deg, #D946EF 0%, #a855f7 100%);
          box-shadow: 0 6px 18px rgba(217,70,239,0.40);
          transition: transform 180ms ease, box-shadow 180ms ease;
          color: #fff;
        }
        .eva-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 28px rgba(217,70,239,0.55);
        }
        .eva-stat-card {
          position: relative; overflow: hidden;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(12px) saturate(140%);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          transition: box-shadow 260ms ease;
          animation: eva-slide-up 500ms ease-out backwards;
          will-change: transform;
        }
        .eva-stat-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: var(--eva-bar);
        }
        .eva-stat-card:hover {
          box-shadow: 0 14px 36px var(--eva-glow, rgba(217,70,239,0.35));
        }
        .eva-stat-value {
          font-size: clamp(1.5rem, 2.5vw, 1.9rem);
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.03em;
          font-variant-numeric: tabular-nums;
          background: var(--eva-text);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .eva-tabs-wrap {
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          animation: eva-slide-up 500ms 100ms ease-out backwards;
        }
        .eva-tabs-list {
          padding: 6px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .eva-tabs-list [data-active='true'] {
          color: #f0abfc !important;
          border-color: #D946EF !important;
        }
      `}</style>
    </Container>
  )
}

// =================================================================
// AURORA: EvaStatCard sub-component
// =================================================================

const EVA_STAT_THEMES = {
  fuchsia: { bar: 'linear-gradient(90deg,#f0abfc,#D946EF)', glow: 'rgba(217,70,239,0.35)', text: 'linear-gradient(135deg,#f0abfc,#D946EF)', color: 'grape'  as const },
  amber:   { bar: 'linear-gradient(90deg,#fbbf24,#F59E0B)', glow: 'rgba(245,158,11,0.35)', text: 'linear-gradient(135deg,#fcd34d,#F59E0B)', color: 'orange' as const },
  mint:    { bar: 'linear-gradient(90deg,#6ee7b7,#10B981)', glow: 'rgba(52,211,153,0.35)', text: 'linear-gradient(135deg,#6ee7b7,#10B981)', color: 'teal'   as const },
  red:     { bar: 'linear-gradient(90deg,#fca5a5,#ef4444)', glow: 'rgba(239,68,68,0.35)',  text: 'linear-gradient(135deg,#fca5a5,#ef4444)', color: 'red'    as const },
  violet:  { bar: 'linear-gradient(90deg,#a78bfa,#7C3AED)', glow: 'rgba(124,58,237,0.35)', text: 'linear-gradient(135deg,#c4b5fd,#7C3AED)', color: 'violet' as const },
} as const

function EvaStatCard({
  label, value, icon: Icon, theme, delay,
}: {
  label: string
  value: string | number
  icon: React.ComponentType<{ size?: number }>
  theme: keyof typeof EVA_STAT_THEMES
  delay: number
}) {
  const tilt = useTilt(5)
  const cfg = EVA_STAT_THEMES[theme]
  return (
    <div
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      style={{ transition: 'transform 260ms cubic-bezier(0.3, 0.5, 0.3, 1)' }}
    >
      <Card
        radius="lg" p="md" withBorder
        className="eva-stat-card"
        style={{
          animationDelay: `${delay}ms`,
          ['--eva-bar' as string]: cfg.bar,
          ['--eva-glow' as string]: cfg.glow,
          ['--eva-text' as string]: cfg.text,
        } as React.CSSProperties}
      >
        <Group gap="sm" align="center" wrap="nowrap">
          <ThemeIcon size="lg" radius="md" variant="light" color={cfg.color}>
            <Icon size={16} />
          </ThemeIcon>
          <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
            <Text className="eva-stat-value">{value}</Text>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text>
          </Stack>
        </Group>
      </Card>
    </div>
  )
}

// ── Question Type Config (shared) ──

const QB_COLORS: Record<string, { bg: string; fg: string; border: string; icon: typeof Star }> = {
  RATING: { bg: 'rgba(245,158,11,0.12)', fg: '#fbbf24', border: 'rgba(245,158,11,0.3)', icon: Star },
  TEXT: { bg: 'rgba(59,130,246,0.12)', fg: '#60a5fa', border: 'rgba(59,130,246,0.3)', icon: FileText },
  YES_NO: { bg: 'rgba(16,185,129,0.12)', fg: '#34d399', border: 'rgba(16,185,129,0.3)', icon: ToggleLeft },
  COMMENT: { bg: 'rgba(168,85,247,0.12)', fg: '#c084fc', border: 'rgba(168,85,247,0.3)', icon: MessageSquare },
}
const QB_TYPE_LABELS: Record<string, string> = { RATING: 'Rating', TEXT: 'Text', YES_NO: 'Yes/No', COMMENT: 'Comment' }

// ── Self-Assessment Modal ──

function SelfAssessmentModal({
  templates, allTemplates, currentUser, onClose, onSubmitted,
}: {
  templates: Template[]; allTemplates: Template[]; currentUser: { id: string; name: string; role: string }
  onClose: () => void; onSubmitted: () => void
}) {
  const available = templates.length > 0 ? templates : allTemplates.slice(0, 6)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(available[0]?.id ?? '')
  const [responses, setResponses] = useState<Record<string, { text: string; yesNo: number }>>({})
  const [additionalComments, setAdditionalComments] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const template = available.find(t => t.id === selectedTemplateId)
  const criteria = template?.criteria ?? []

  function setResponse(criterionId: string, field: 'text' | 'yesNo', value: string | number) {
    setResponses(prev => ({
      ...prev,
      [criterionId]: { ...prev[criterionId], [field]: value },
    }))
  }

  const answeredCount = criteria.filter(c => {
    const r = responses[c.id]
    const type = c.type ?? 'RATING'
    if (type === 'TEXT' || type === 'COMMENT') return !!r?.text?.trim()
    if (type === 'YES_NO') return r?.yesNo === 1 || r?.yesNo === 2
    if (type === 'RATING') return (r?.yesNo ?? 0) >= 1
    return false
  }).length

  const progressPct = criteria.length > 0 ? Math.round((answeredCount / criteria.length) * 100) : 0
  const allAnswered = answeredCount === criteria.length && criteria.length > 0

  async function handleSubmit() {
    if (!allAnswered || !template) return
    setSaving(true); setError(null)
    try {
      const scores: Record<string, { score: number; comment: string | null }> = {}
      for (const c of criteria) {
        const r = responses[c.id]
        const type = c.type ?? 'RATING'
        if (type === 'TEXT' || type === 'COMMENT') {
          scores[c.id] = { score: 0, comment: r?.text?.trim() || null }
        } else if (type === 'YES_NO') {
          scores[c.id] = { score: r?.yesNo ?? 0, comment: r?.text?.trim() || null }
        } else {
          scores[c.id] = { score: r?.yesNo ?? 0, comment: r?.text?.trim() || null }
        }
      }

      const res = await fetch('/api/workryn/evaluations/self-assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          scores,
          comments: additionalComments.trim(),
        }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error || 'Failed to submit')
      }

      onSubmitted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit')
    }
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-scale-in eval-wide-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 780 }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #10b981, #3b82f6)', borderRadius: '24px 24px 0 0' }} />
        <div className="modal-header" style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <Edit2 size={18} color="#34d399" /> Self-Assessment
            </h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Complete all questions below and submit before your supervisor meeting.
            </p>
          </div>
          <button className="btn btn-icon btn-ghost focus-ring" onClick={onClose} type="button" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Template info */}
          {available.length === 1 ? (
            <div style={{ padding: '14px 18px', background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(59,130,246,0.06))', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{template?.name}</div>
              {template?.description && <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{template.description}</div>}
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 6 }}>{criteria.length} question{criteria.length !== 1 ? 's' : ''} to complete</div>
            </div>
          ) : (
            <div className="form-group">
              <label className="label">Assessment Type *</label>
              <select
                className="input focus-ring"
                value={selectedTemplateId}
                onChange={e => { setSelectedTemplateId(e.target.value); setResponses({}) }}
              >
                {available.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.criteria.length} questions)</option>
                ))}
              </select>
            </div>
          )}

          {template?.description && (
            <div style={{ padding: '10px 14px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <Info size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6, color: '#60a5fa' }} />
              {template.description}
            </div>
          )}

          {/* Progress bar */}
          <div className="sa-progress">
            <div className="sa-progress-bar">
              <div className="sa-progress-fill" style={{
                width: `${progressPct}%`,
                background: progressPct === 100 ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                boxShadow: progressPct === 100 ? '0 0 12px rgba(16,185,129,0.4)' : '0 0 12px rgba(59,130,246,0.3)',
              }} />
            </div>
            <div className="sa-progress-text">
              {answeredCount} of {criteria.length} questions answered ({progressPct}%)
            </div>
          </div>

          {/* Questions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {criteria.map((c, i) => {
              const type = c.type ?? 'RATING'
              const r = responses[c.id]
              const typeConfig = QB_COLORS[type] ?? QB_COLORS.RATING
              const TypeIcon = typeConfig.icon

              return (
                <div key={c.id} className="sa-question">
                  <div className="sa-question-header">
                    <span className="sa-question-num" style={{ background: typeConfig.bg, color: typeConfig.fg }}>{i + 1}</span>
                    <span className="sa-question-label">{c.label}</span>
                    <span className="sa-question-type" style={{ background: typeConfig.bg, color: typeConfig.fg }}>
                      <TypeIcon size={10} /> {QB_TYPE_LABELS[type] ?? type}
                    </span>
                  </div>

                  {(type === 'TEXT' || type === 'COMMENT') && (
                    <textarea
                      className="sa-textarea"
                      placeholder="Type your response here…"
                      value={r?.text ?? ''}
                      onChange={e => setResponse(c.id, 'text', e.target.value)}
                    />
                  )}

                  {type === 'YES_NO' && (
                    <>
                      <div className="sa-yn-btns">
                        <button
                          type="button"
                          className={`sa-yn-btn ${r?.yesNo === 1 ? 'active-yes' : ''}`}
                          onClick={() => setResponse(c.id, 'yesNo', 1)}
                        >
                          <CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} /> Yes
                        </button>
                        <button
                          type="button"
                          className={`sa-yn-btn ${r?.yesNo === 2 ? 'active-no' : ''}`}
                          onClick={() => setResponse(c.id, 'yesNo', 2)}
                        >
                          <X size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} /> No
                        </button>
                      </div>
                      <textarea
                        className="sa-textarea"
                        style={{ marginTop: 8, minHeight: 50 }}
                        placeholder="Please elaborate (optional)…"
                        value={r?.text ?? ''}
                        onChange={e => setResponse(c.id, 'text', e.target.value)}
                      />
                    </>
                  )}

                  {type === 'RATING' && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <StarRow value={r?.yesNo ?? 0} max={c.maxScore} onChange={v => setResponse(c.id, 'yesNo', v)} size={20} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 4 }}>
                          {r?.yesNo ? `${r.yesNo} / ${c.maxScore}` : `Select 1–${c.maxScore}`}
                        </span>
                      </div>
                      <textarea
                        className="sa-textarea"
                        style={{ minHeight: 50 }}
                        placeholder="Comments (optional)…"
                        value={r?.text ?? ''}
                        onChange={e => setResponse(c.id, 'text', e.target.value)}
                      />
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {/* Additional comments */}
          <div className="form-group">
            <label className="label">Additional Comments (Optional)</label>
            <textarea
              className="input focus-ring"
              style={{ minHeight: 80, resize: 'vertical' }}
              placeholder="Any additional thoughts, concerns, or topics you'd like to discuss during your meeting…"
              value={additionalComments}
              onChange={e => setAdditionalComments(e.target.value)}
            />
          </div>

          {error && (
            <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem' }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--border-subtle)', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            {allAnswered ? (
              <span style={{ color: '#10b981', fontWeight: 600 }}>✓ All questions answered — ready to submit</span>
            ) : (
              <span>{criteria.length - answeredCount} question{criteria.length - answeredCount !== 1 ? 's' : ''} remaining</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost focus-ring" onClick={onClose} type="button">Cancel</button>
            <button
              className="btn btn-gradient focus-ring"
              onClick={handleSubmit}
              disabled={!allAnswered || saving}
              type="button"
            >
              {saving ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
              Submit Self-Assessment
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Empty State ──

function EmptyEvalState({ isManager, tab }: {
  isManager: boolean; tab: Tab
}) {
  const messages: Record<string, { title: string; desc: string }> = {
    given: {
      title: 'No submitted self-assessments to review',
      desc: 'When support planners complete their self-assessments, they will appear here for your review. Use the onboarding workflow above to send reminders.',
    },
    received: {
      title: 'No evaluations received',
      desc: 'Your supervisor hasn\'t shared any evaluations with you yet. They\'ll appear here when ready.',
    },
    all: {
      title: 'No evaluations found',
      desc: 'No evaluations or self-assessments have been submitted yet.',
    },
  }
  const m = messages[tab] ?? messages.all
  const msg = !isManager
    ? { title: 'No evaluations yet', desc: 'Your supervisor has not shared any evaluations yet. They\'ll appear here when ready.' }
    : m

  return (
    <div className="eval-empty animate-slide-up">
      <div className="eval-empty-icon">
        <Award size={36} color="var(--brand-light)" />
      </div>
      <h3>{msg.title}</h3>
      <p>{msg.desc}</p>
    </div>
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
  const color = overall > 0 ? ratingColor(overall) : 'var(--text-muted)'
  const topScores = [...e.scores].sort((a, b) => a.criterion.order - b.criterion.order).slice(0, 3)

  return (
    <div
      className={`gradient-card eval-card animate-slide-up ${needsAck ? 'needs-ack-pulse' : ''}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen() } }}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="eval-card-template">{e.template.name}</div>
          <div className="eval-card-title">
            {isMine ? `Review from ${e.evaluator.name || 'your supervisor'}` : e.agent.name || 'Unnamed agent'}
          </div>
        </div>
        <div className="eval-card-score-ring" style={{
          background: `conic-gradient(${color} ${(overall / 5) * 360}deg, rgba(255,255,255,0.06) 0deg)`,
          boxShadow: overall > 0 ? `0 0 16px ${color}33` : 'none',
        }}>
          <div className="eval-card-score-inner" style={{ color: overall > 0 ? color : 'var(--text-muted)' }}>
            {overall > 0 ? overall : '—'}
          </div>
        </div>
      </div>

      <div className="eval-meta-row">
        <Avatar user={isMine ? e.evaluator : e.agent} size={26} />
        <span><strong>{isMine ? e.evaluator.name : e.agent.name}</strong> · {timeAgo(e.createdAt)}</span>
      </div>

      {topScores.length > 0 && (
        <div className="eval-card-scores">
          {topScores.map((s) => (
            <div key={s.id} className="eval-card-score-item">
              <span className="eval-card-score-label">{s.criterion.label}</span>
              <ScoreBar score={s.score} max={s.criterion.maxScore} color={ratingColor(s.score)} />
            </div>
          ))}
          {e.scores.length > 3 && (
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', textAlign: 'right' }}>
              +{e.scores.length - 3} more
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {e.isPrivate && (
          <span className="private-ribbon" title="Only visible to evaluators and admins"><EyeOff size={11} /> Private</span>
        )}
        {e.acknowledgedAt ? (
          <span className="ack-ribbon"><CheckCircle2 size={11} /> Acknowledged</span>
        ) : needsAck ? (
          <span className="badge badge-warning">Needs acknowledgement</span>
        ) : null}
        {e.documentUrl && <span className="badge badge-muted"><Paperclip size={10} /> Document</span>}
      </div>
    </div>
  )
}

// ── Question Bank View (PurelyHR-style) ──

// ── Onboarding Workflow Panel ──

type OnboardingStatus = {
  id: string; name: string | null; email: string | null
  jobTitle: string | null; avatarColor: string
  hireDate: string; daysSinceHire: number
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'OVERDUE' | 'COMPLETED'
  remindersTotal: number; remindersPending: number
  has30DayEval: boolean; evalCompleted: string | null
}

const OB_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  NOT_STARTED: { label: 'Not Started', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  IN_PROGRESS: { label: 'In Progress', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  OVERDUE: { label: 'Overdue', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  COMPLETED: { label: 'Completed', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
}

function OnboardingWorkflowPanel({ staffUsers, currentUserName }: { staffUsers: UserLite[]; currentUserName: string }) {
  const [expanded, setExpanded] = useState(false)
  const [newHires, setNewHires] = useState<OnboardingStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [sending, setSending] = useState<string | null>(null)
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  async function loadNewHires() {
    setLoading(true)
    try {
      const res = await fetch('/api/workryn/evaluations/onboarding')
      if (res.ok) {
        const data = await res.json()
        setNewHires(data.newHires ?? [])
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => { if (expanded) loadNewHires() }, [expanded])

  async function triggerWorkflow(userId: string, action: 'start' | 'remind' | 'nudge') {
    setSending(userId + action); setError(null)
    try {
      const res = await fetch('/api/workryn/evaluations/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error || 'Failed')
      }
      setSent(prev => new Set(prev).add(userId + action))
      await loadNewHires()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to send') }
    setSending(null)
  }

  const CALENDLY = 'https://calendly.com/sabbott-9/evaluations'
  const COUNTY_FORM = '/w/county-preference'

  return (
    <div className="ob-panel animate-slide-up" style={{ animationDelay: '280ms' }}>
      <button
        type="button"
        className="ob-panel-toggle focus-ring"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="ob-toggle-left">
          <div className="ob-toggle-icon">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="ob-toggle-title">30-Day Onboarding Workflow</div>
            <div className="ob-toggle-sub">
              Send assessment links, schedule meetings, and track new hire progress
            </div>
          </div>
        </div>
        <div className="ob-toggle-arrow" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▾
        </div>
      </button>

      {expanded && (
        <div className="ob-panel-body">
          {/* Quick links row */}
          <div className="ob-links-row">
            <a href={CALENDLY} target="_blank" rel="noopener noreferrer" className="ob-link-card focus-ring" style={{ '--ob-accent': '#3b82f6' } as React.CSSProperties}>
              <div className="ob-link-icon" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>📅</div>
              <div className="ob-link-info">
                <div className="ob-link-label">Calendly — Sarah Abbott</div>
                <div className="ob-link-desc">Evaluation meeting scheduling</div>
              </div>
              <span style={{ fontSize: '0.6875rem', color: 'var(--brand-light)' }}>Open →</span>
            </a>
            <a href={COUNTY_FORM} className="ob-link-card focus-ring" style={{ '--ob-accent': '#10b981' } as React.CSSProperties}>
              <div className="ob-link-icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>📝</div>
              <div className="ob-link-info">
                <div className="ob-link-label">County Preference Form</div>
                <div className="ob-link-desc">Client assignment region selection</div>
              </div>
              <span style={{ fontSize: '0.6875rem', color: '#34d399' }}>Open →</span>
            </a>
          </div>

          {/* Send to specific user */}
          <div className="ob-send-row">
            <div className="ob-send-label">
              <Zap size={14} /> Launch workflow for a new support planner:
            </div>
            <div className="ob-send-controls">
              <select
                className="input focus-ring ob-select"
                value={selectedUser}
                onChange={e => setSelectedUser(e.target.value)}
              >
                <option value="">Select team member…</option>
                {staffUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name || u.email}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-gradient focus-ring"
                disabled={!selectedUser || sending === selectedUser + 'start'}
                onClick={() => selectedUser && triggerWorkflow(selectedUser, 'start')}
              >
                {sending === selectedUser + 'start' ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                Start Workflow
              </button>
            </div>
            {sent.has(selectedUser + 'start') && (
              <div style={{ fontSize: '0.8125rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <CheckCircle2 size={14} /> Workflow launched — reminders scheduled, links sent
              </div>
            )}
            {error && (
              <div style={{ fontSize: '0.8125rem', color: '#ef4444', marginTop: 4 }}>{error}</div>
            )}
          </div>

          {/* New hires tracker */}
          <div className="ob-tracker">
            <div className="ob-tracker-header">
              <Users size={14} />
              <span>New Hire Tracker (last 45 days)</span>
              <button type="button" className="btn btn-ghost btn-sm focus-ring" onClick={loadNewHires} disabled={loading}>
                {loading ? <Loader2 size={12} className="spin" /> : '↻'} Refresh
              </button>
            </div>

            {loading && newHires.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                <Loader2 size={18} className="spin" style={{ marginBottom: 8 }} /> Loading…
              </div>
            ) : newHires.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                No new hires in the last 45 days.
              </div>
            ) : (
              <div className="ob-tracker-list">
                {newHires.map(u => {
                  const sc = OB_STATUS_CONFIG[u.status]
                  const progressPct = u.status === 'COMPLETED' ? 100 :
                    Math.min(100, Math.round((u.daysSinceHire / 30) * 100))

                  return (
                    <div key={u.id} className="ob-hire-row">
                      <Avatar user={{ name: u.name, avatarColor: u.avatarColor }} size={32} />
                      <div className="ob-hire-info">
                        <div className="ob-hire-name">{u.name || u.email}</div>
                        <div className="ob-hire-meta">
                          Day {u.daysSinceHire} of 30 · {u.remindersTotal} reminder{u.remindersTotal !== 1 ? 's' : ''} sent
                        </div>
                      </div>
                      <div className="ob-hire-progress">
                        <div className="ob-progress-bar">
                          <div
                            className="ob-progress-fill"
                            style={{
                              width: `${progressPct}%`,
                              background: `linear-gradient(90deg, ${sc.color}, ${sc.color}aa)`,
                              boxShadow: `0 0 10px ${sc.color}44`,
                            }}
                          />
                        </div>
                        <span className="ob-hire-badge" style={{ background: sc.bg, color: sc.color }}>
                          {sc.label}
                        </span>
                      </div>
                      <div className="ob-hire-actions">
                        {u.status !== 'COMPLETED' && (
                          <>
                            <button
                              type="button" className="btn btn-ghost btn-sm focus-ring"
                              onClick={() => triggerWorkflow(u.id, 'remind')}
                              disabled={sending === u.id + 'remind'}
                              title="Send friendly reminder"
                            >
                              {sending === u.id + 'remind' ? <Loader2 size={12} className="spin" /> : <Clock size={12} />}
                              Remind
                            </button>
                            {u.status === 'OVERDUE' && (
                              <button
                                type="button" className="btn btn-sm focus-ring"
                                style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                                onClick={() => triggerWorkflow(u.id, 'nudge')}
                                disabled={sending === u.id + 'nudge'}
                                title="Send urgent nudge"
                              >
                                {sending === u.id + 'nudge' ? <Loader2 size={12} className="spin" /> : <Zap size={12} />}
                                Nudge
                              </button>
                            )}
                          </>
                        )}
                        {u.status === 'COMPLETED' && (
                          <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircle2 size={12} /> Done
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .ob-panel {
          margin-bottom: 20px; background: var(--glass-bg); backdrop-filter: var(--glass-blur);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);
          overflow: hidden; transition: all var(--transition-smooth);
        }
        .ob-panel:hover { border-color: var(--border-default); }
        .ob-panel-toggle {
          width: 100%; display: flex; align-items: center; justify-content: space-between;
          gap: 16px; padding: 16px 20px; background: transparent; border: none;
          cursor: pointer; color: inherit; text-align: left;
        }
        .ob-toggle-left { display: flex; align-items: center; gap: 14px; }
        .ob-toggle-icon {
          width: 40px; height: 40px; border-radius: 10px;
          background: linear-gradient(135deg, rgba(37,99,235,0.15), rgba(139,92,246,0.15));
          display: flex; align-items: center; justify-content: center;
          color: var(--brand-light); flex-shrink: 0;
        }
        .ob-toggle-title { font-size: 0.9375rem; font-weight: 700; color: var(--text-primary); }
        .ob-toggle-sub { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
        .ob-toggle-arrow {
          font-size: 1.2rem; color: var(--text-muted);
          transition: transform 0.2s ease;
        }
        .ob-panel-body { padding: 0 20px 20px; display: flex; flex-direction: column; gap: 16px; }

        /* Links row */
        .ob-links-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 700px) { .ob-links-row { grid-template-columns: 1fr; } }
        .ob-link-card {
          display: flex; align-items: center; gap: 12px; padding: 14px 16px;
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md); text-decoration: none; color: inherit;
          transition: all var(--transition-smooth);
        }
        .ob-link-card:hover {
          border-color: var(--border-default); transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        }
        .ob-link-icon {
          width: 40px; height: 40px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.125rem; flex-shrink: 0;
        }
        .ob-link-info { flex: 1; min-width: 0; }
        .ob-link-label { font-size: 0.875rem; font-weight: 600; color: var(--text-primary); }
        .ob-link-desc { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }

        /* Send controls */
        .ob-send-row {
          padding: 14px 16px; background: var(--bg-surface);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
        }
        .ob-send-label {
          display: flex; align-items: center; gap: 6px;
          font-size: 0.8125rem; font-weight: 600; color: var(--text-secondary);
          margin-bottom: 10px;
        }
        .ob-send-controls { display: flex; gap: 10px; flex-wrap: wrap; }
        .ob-select { flex: 1; min-width: 200px; }

        /* Tracker */
        .ob-tracker {
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md); overflow: hidden;
        }
        .ob-tracker-header {
          display: flex; align-items: center; gap: 8px; padding: 12px 16px;
          font-size: 0.8125rem; font-weight: 700; color: var(--text-secondary);
          text-transform: uppercase; letter-spacing: 0.04em;
          border-bottom: 1px solid var(--border-subtle);
          background: rgba(255,255,255,0.015);
        }
        .ob-tracker-header .btn { margin-left: auto; }
        .ob-tracker-list { display: flex; flex-direction: column; }
        .ob-hire-row {
          display: flex; align-items: center; gap: 12px; padding: 12px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.03);
          transition: background 0.1s;
        }
        .ob-hire-row:last-child { border-bottom: none; }
        .ob-hire-row:hover { background: rgba(37,99,235,0.03); }
        .ob-hire-info { flex: 1; min-width: 0; }
        .ob-hire-name { font-size: 0.875rem; font-weight: 600; color: var(--text-primary); }
        .ob-hire-meta { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
        .ob-hire-progress { display: flex; align-items: center; gap: 10px; min-width: 180px; }
        .ob-progress-bar { flex: 1; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.06); overflow: hidden; }
        .ob-progress-fill { height: 100%; border-radius: 3px; transition: width 600ms ease; }
        .ob-hire-badge {
          font-size: 0.6875rem; font-weight: 700; padding: 3px 10px;
          border-radius: 99px; text-transform: uppercase; letter-spacing: 0.04em;
          white-space: nowrap;
        }
        .ob-hire-actions { display: flex; gap: 6px; flex-shrink: 0; }
        @media (max-width: 800px) {
          .ob-hire-row { flex-wrap: wrap; }
          .ob-hire-progress { width: 100%; order: 10; }
        }
      `}</style>
    </div>
  )
}

const DONUT_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#a855f7', '#6366f1', '#84cc16', '#e11d48', '#0ea5e9', '#d946ef', '#22c55e', '#eab308']

function DonutChart({ data, size = 180 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return null
  const r = size / 2
  const ir = r * 0.62
  const cx = r
  const cy = r
  let cumAngle = -Math.PI / 2

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', filter: 'drop-shadow(0 4px 24px rgba(0,0,0,0.3))' }}>
      {data.map((d, i) => {
        const pct = d.value / total
        const angle = pct * 2 * Math.PI
        const startAngle = cumAngle
        const endAngle = cumAngle + angle
        cumAngle = endAngle

        const x1 = cx + r * Math.cos(startAngle)
        const y1 = cy + r * Math.sin(startAngle)
        const x2 = cx + r * Math.cos(endAngle)
        const y2 = cy + r * Math.sin(endAngle)
        const ix1 = cx + ir * Math.cos(endAngle)
        const iy1 = cy + ir * Math.sin(endAngle)
        const ix2 = cx + ir * Math.cos(startAngle)
        const iy2 = cy + ir * Math.sin(startAngle)
        const largeArc = angle > Math.PI ? 1 : 0

        const path = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${ir} ${ir} 0 ${largeArc} 0 ${ix2} ${iy2} Z`

        return (
          <path
            key={i}
            d={path}
            fill={d.color}
            stroke="rgba(0,0,0,0.3)"
            strokeWidth="1"
            style={{ transition: 'opacity 0.2s' }}
          >
            <title>{d.label}: {d.value} ({(pct * 100).toFixed(0)}%)</title>
          </path>
        )
      })}
      <circle cx={cx} cy={cy} r={ir - 1} fill="var(--glass-bg, rgba(18,18,26,0.9))" />
      <text x={cx} y={cy - 8} textAnchor="middle" fill="var(--text-primary, #f5f5f7)" fontSize="28" fontWeight="800">{total}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="var(--text-muted, rgba(255,255,255,0.45))" fontSize="11" fontWeight="600" letterSpacing="0.06em">QUESTIONS</text>
    </svg>
  )
}

function BarGraph({ items, maxValue }: { items: { label: string; value: number; color: string }[]; maxValue: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, i) => {
        const pct = maxValue > 0 ? (item.value / maxValue) * 100 : 0
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: 90, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.label}
            </span>
            <div style={{ flex: 1, height: 28, background: 'rgba(255,255,255,0.04)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
              <div style={{
                width: `${pct}%`, height: '100%', borderRadius: 6,
                background: `linear-gradient(90deg, ${item.color}, ${item.color}99)`,
                boxShadow: `0 0 16px ${item.color}33`,
                transition: 'width 800ms cubic-bezier(0.4,0,0.2,1)',
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8,
              }}>
                {pct > 12 && (
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
                    {item.value}
                  </span>
                )}
              </div>
              {pct <= 12 && (
                <span style={{ position: 'absolute', left: `${pct + 1}%`, top: '50%', transform: 'translateY(-50%)', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {item.value}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function QuestionBankView({ templates }: { templates: Template[] }) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null)

  const activeTemplates = templates.filter(t => t.isActive)

  // Build stats
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { RATING: 0, TEXT: 0, YES_NO: 0, COMMENT: 0 }
    activeTemplates.forEach(t => t.criteria.forEach(c => { counts[(c as any).type ?? 'RATING'] = (counts[(c as any).type ?? 'RATING'] || 0) + 1 }))
    return counts
  }, [activeTemplates])

  const totalQuestions = Object.values(typeCounts).reduce((s, v) => s + v, 0)

  // Filter
  const filtered = useMemo(() => {
    const s = search.toLowerCase()
    return activeTemplates.map(t => ({
      ...t,
      criteria: t.criteria.filter(c => {
        const type = (c as any).type ?? 'RATING'
        const matchSearch = !s || c.label.toLowerCase().includes(s)
        const matchType = typeFilter === 'ALL' || type === typeFilter
        return matchSearch && matchType
      }),
    })).filter(t => t.criteria.length > 0)
  }, [activeTemplates, search, typeFilter])

  const filteredTotal = filtered.reduce((s, t) => s + t.criteria.length, 0)

  // Donut data for templates
  const donutData = activeTemplates.map((t, i) => ({
    label: t.name,
    value: t.criteria.length,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  })).filter(d => d.value > 0)

  // Donut data for types
  const typeDonut = Object.entries(typeCounts).filter(([, v]) => v > 0).map(([type, value]) => ({
    label: QB_TYPE_LABELS[type] ?? type,
    value,
    color: QB_COLORS[type]?.fg ?? '#888',
  }))

  // Bar graph data
  const barData = activeTemplates.map((t, i) => ({
    label: t.name.length > 18 ? t.name.slice(0, 16) + '…' : t.name,
    value: t.criteria.length,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  })).filter(d => d.value > 0).sort((a, b) => b.value - a.value)

  const maxBar = Math.max(...barData.map(d => d.value), 1)

  return (
    <div className="qb-container">
      {/* ── Visual Stats Row ── */}
      <div className="qb-charts-row">
        {/* Donut: By Template */}
        <div className="qb-chart-card animate-slide-up" style={{ animationDelay: '0ms' }}>
          <div className="qb-chart-header">
            <PieChart size={16} style={{ color: '#3b82f6' }} />
            <span>Questions by Template</span>
          </div>
          <div className="qb-donut-wrap">
            <DonutChart data={donutData} size={170} />
          </div>
          <div className="qb-donut-legend">
            {donutData.slice(0, 8).map((d, i) => (
              <div key={i} className="qb-legend-item">
                <span className="qb-legend-dot" style={{ background: d.color }} />
                <span className="qb-legend-label">{d.label}</span>
                <span className="qb-legend-value">{d.value}</span>
              </div>
            ))}
            {donutData.length > 8 && <div className="qb-legend-item" style={{ color: 'var(--text-muted)' }}>+{donutData.length - 8} more</div>}
          </div>
        </div>

        {/* Donut: By Type */}
        <div className="qb-chart-card animate-slide-up" style={{ animationDelay: '80ms' }}>
          <div className="qb-chart-header">
            <BarChart3 size={16} style={{ color: '#f59e0b' }} />
            <span>Questions by Type</span>
          </div>
          <div className="qb-donut-wrap">
            <DonutChart data={typeDonut} size={170} />
          </div>
          <div className="qb-type-chips">
            {Object.entries(typeCounts).filter(([, v]) => v > 0).map(([type, count]) => {
              const c = QB_COLORS[type] ?? QB_COLORS.RATING
              const Icon = c.icon
              return (
                <div key={type} className="qb-type-chip" style={{ background: c.bg, borderColor: c.border }}>
                  <Icon size={13} style={{ color: c.fg }} />
                  <span style={{ color: c.fg, fontWeight: 700 }}>{QB_TYPE_LABELS[type]}</span>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.8125rem' }}>{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Bar Graph */}
        <div className="qb-chart-card qb-bar-card animate-slide-up" style={{ animationDelay: '160ms' }}>
          <div className="qb-chart-header">
            <Target size={16} style={{ color: '#10b981' }} />
            <span>Template Distribution</span>
          </div>
          <BarGraph items={barData} maxValue={maxBar} />
        </div>
      </div>

      {/* ── Search + Filter Bar ── */}
      <div className="qb-filter-bar animate-slide-up" style={{ animationDelay: '200ms' }}>
        <div className="qb-search-wrap">
          <Search size={15} style={{ color: 'var(--text-muted)', position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text" placeholder="Search all questions…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input focus-ring qb-search-input"
          />
        </div>
        <div className="qb-filter-chips">
          {[{ key: 'ALL', label: 'All Types' }, ...Object.entries(QB_TYPE_LABELS).map(([k, v]) => ({ key: k, label: v }))].map(f => {
            const isActive = typeFilter === f.key
            const color = f.key === 'ALL' ? '#3b82f6' : QB_COLORS[f.key]?.fg ?? '#888'
            return (
              <button
                key={f.key} type="button"
                className={`qb-filter-chip focus-ring ${isActive ? 'active' : ''}`}
                onClick={() => setTypeFilter(f.key)}
                style={isActive ? { borderColor: color, background: `${color}18`, color } : {}}
              >
                {f.label}
                {f.key !== 'ALL' && <span style={{ opacity: 0.6 }}>{typeCounts[f.key] ?? 0}</span>}
              </button>
            )
          })}
        </div>
        <div className="qb-result-count">
          {filteredTotal} result{filteredTotal !== 1 ? 's' : ''}
          {(search || typeFilter !== 'ALL') && <span style={{ color: 'var(--text-muted)' }}> / {totalQuestions}</span>}
        </div>
      </div>

      {/* ── Template Sidebar + Question List ── */}
      <div className="qb-body">
        <aside className="qb-sidebar">
          <button
            type="button"
            className={`qb-sidebar-btn focus-ring ${activeTemplate === null ? 'active' : ''}`}
            onClick={() => setActiveTemplate(null)}
          >
            <span>All Templates</span>
            <span className="qb-sidebar-count">{totalQuestions}</span>
          </button>
          {activeTemplates.map((t, i) => (
            <button
              key={t.id} type="button"
              className={`qb-sidebar-btn focus-ring ${activeTemplate === t.id ? 'active' : ''}`}
              onClick={() => setActiveTemplate(activeTemplate === t.id ? null : t.id)}
            >
              <span className="qb-sidebar-dot" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
              <span className="qb-sidebar-label">{t.name}</span>
              <span className="qb-sidebar-count">{t.criteria.length}</span>
            </button>
          ))}
        </aside>

        <div className="qb-questions">
          {filtered.length === 0 ? (
            <div className="eval-empty" style={{ padding: '40px 20px' }}>
              <div className="eval-empty-icon"><Search size={32} color="var(--brand-light)" /></div>
              <h3>No questions match</h3>
              <p>Try a different search term or filter.</p>
            </div>
          ) : (
            filtered
              .filter(t => !activeTemplate || t.id === activeTemplate)
              .map((t, ti) => (
                <div key={t.id} className="qb-template-section animate-slide-up" style={{ animationDelay: `${ti * 40}ms` }}>
                  <div className="qb-section-header">
                    <span className="qb-section-dot" style={{ background: DONUT_COLORS[activeTemplates.findIndex(at => at.id === t.id) % DONUT_COLORS.length] }} />
                    <h3 className="qb-section-title">{t.name}</h3>
                    <span className="qb-section-count">{t.criteria.length} question{t.criteria.length !== 1 ? 's' : ''}</span>
                  </div>
                  {t.description && <p className="qb-section-desc">{t.description}</p>}
                  <div className="qb-question-list">
                    {t.criteria.map((c, ci) => {
                      const type = (c as any).type ?? 'RATING'
                      const tc = QB_COLORS[type] ?? QB_COLORS.RATING
                      const Icon = tc.icon
                      return (
                        <div key={c.id} className="qb-question-row">
                          <span className="qb-q-num">{ci + 1}</span>
                          <span className="qb-q-text">{c.label}</span>
                          <span className="qb-q-badge" style={{ background: tc.bg, color: tc.fg, borderColor: tc.border }}>
                            <Icon size={11} />
                            {QB_TYPE_LABELS[type]}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
          )}
        </div>
      </div>

      <style>{`
        .qb-container { display: flex; flex-direction: column; gap: 24px; }

        /* ── Charts Row ── */
        .qb-charts-row { display: grid; grid-template-columns: 1fr 1fr 1.3fr; gap: 16px; }
        @media (max-width: 1100px) { .qb-charts-row { grid-template-columns: 1fr 1fr; } .qb-bar-card { grid-column: 1 / -1; } }
        @media (max-width: 700px) { .qb-charts-row { grid-template-columns: 1fr; } }
        .qb-chart-card {
          padding: 20px; background: var(--glass-bg); backdrop-filter: var(--glass-blur);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);
          display: flex; flex-direction: column; gap: 16px;
          transition: all var(--transition-smooth);
        }
        .qb-chart-card:hover { border-color: var(--border-default); transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
        .qb-chart-header {
          display: flex; align-items: center; gap: 8px;
          font-size: 0.8125rem; font-weight: 700; color: var(--text-secondary);
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .qb-donut-wrap { display: flex; justify-content: center; padding: 4px 0; }
        .qb-donut-legend { display: flex; flex-direction: column; gap: 4px; }
        .qb-legend-item { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; }
        .qb-legend-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
        .qb-legend-label { flex: 1; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .qb-legend-value { font-weight: 700; color: var(--text-primary); min-width: 20px; text-align: right; }
        .qb-type-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .qb-type-chip {
          display: flex; align-items: center; gap: 6px; padding: 6px 12px;
          border-radius: 8px; border: 1px solid; font-size: 0.8125rem;
        }

        /* ── Filter Bar ── */
        .qb-filter-bar {
          display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
          padding: 14px 18px; background: var(--glass-bg); backdrop-filter: var(--glass-blur);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);
        }
        .qb-search-wrap { position: relative; flex: 1; min-width: 200px; }
        .qb-search-input { padding-left: 36px !important; }
        .qb-filter-chips { display: flex; gap: 6px; flex-wrap: wrap; }
        .qb-filter-chip {
          padding: 6px 14px; border-radius: 99px; font-size: 0.8125rem; font-weight: 500;
          border: 1px solid var(--border-subtle); background: var(--bg-elevated);
          color: var(--text-muted); cursor: pointer; transition: all var(--transition);
          display: inline-flex; align-items: center; gap: 6px;
        }
        .qb-filter-chip:hover { color: var(--text-primary); border-color: var(--border-default); }
        .qb-filter-chip.active { font-weight: 700; }
        .qb-result-count { font-size: 0.8125rem; color: var(--text-muted); font-weight: 600; white-space: nowrap; margin-left: auto; }

        /* ── Body (sidebar + questions) ── */
        .qb-body { display: grid; grid-template-columns: 240px 1fr; gap: 16px; }
        @media (max-width: 800px) { .qb-body { grid-template-columns: 1fr; } .qb-sidebar { display: flex; flex-wrap: wrap; gap: 6px; } }
        .qb-sidebar {
          display: flex; flex-direction: column; gap: 3px;
          position: sticky; top: 80px; align-self: start;
          max-height: calc(100vh - 120px); overflow-y: auto;
          padding: 12px; background: var(--glass-bg); backdrop-filter: var(--glass-blur);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);
        }
        .qb-sidebar-btn {
          display: flex; align-items: center; gap: 8px; width: 100%;
          padding: 8px 10px; border-radius: 8px; border: none;
          background: transparent; color: var(--text-muted); cursor: pointer;
          font-size: 0.8125rem; text-align: left; transition: all 0.15s;
        }
        .qb-sidebar-btn:hover { color: var(--text-primary); background: var(--bg-hover); }
        .qb-sidebar-btn.active { color: var(--text-primary); background: rgba(37,99,235,0.15); font-weight: 600; }
        .qb-sidebar-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
        .qb-sidebar-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .qb-sidebar-count {
          font-size: 0.6875rem; font-weight: 700; color: var(--text-muted);
          min-width: 20px; text-align: right;
        }

        /* ── Question sections ── */
        .qb-questions { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
        .qb-template-section {
          background: var(--glass-bg); backdrop-filter: var(--glass-blur);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);
          overflow: hidden;
        }
        .qb-section-header {
          display: flex; align-items: center; gap: 10px;
          padding: 14px 18px; border-bottom: 1px solid var(--border-subtle);
          background: rgba(255,255,255,0.015);
        }
        .qb-section-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
        .qb-section-title { font-size: 0.9375rem; font-weight: 700; color: var(--text-primary); flex: 1; margin: 0; }
        .qb-section-count {
          font-size: 0.75rem; color: var(--text-muted);
          background: rgba(255,255,255,0.05); padding: 2px 10px;
          border-radius: 99px; font-weight: 600;
        }
        .qb-section-desc {
          padding: 8px 18px; margin: 0; font-size: 0.8125rem;
          color: var(--text-muted); line-height: 1.5; border-bottom: 1px solid var(--border-subtle);
        }
        .qb-question-list { display: flex; flex-direction: column; }
        .qb-question-row {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 18px; transition: background 0.1s;
          border-bottom: 1px solid rgba(255,255,255,0.03);
        }
        .qb-question-row:last-child { border-bottom: none; }
        .qb-question-row:hover { background: rgba(37,99,235,0.04); }
        .qb-q-num {
          font-size: 0.6875rem; font-weight: 600; color: var(--text-muted);
          min-width: 24px; text-align: center;
          font-variant-numeric: tabular-nums;
        }
        .qb-q-text { flex: 1; font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5; }
        .qb-q-badge {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 10px; border-radius: 6px; border: 1px solid;
          font-size: 0.6875rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.04em; white-space: nowrap;
        }
      `}</style>
    </div>
  )
}

// ── Templates grid ──

function TemplatesGrid({
  templates, isAdmin, onEdit, onDelete,
}: {
  templates: Template[]; isAdmin: boolean; onEdit: (t: Template) => void; onDelete: (id: string) => void
}) {
  const active = templates.filter((t) => t.isActive)
  if (active.length === 0) {
    return (
      <div className="eval-empty animate-slide-up">
        <div className="eval-empty-icon"><ClipboardCheck size={36} color="#a78bfa" /></div>
        <h3>No templates yet</h3>
        <p>Templates define the criteria used to evaluate team members. Create one to get started.</p>
      </div>
    )
  }
  return (
    <div className="eval-grid">
      {active.map((t, i) => (
        <div key={t.id} className="glass-card template-card animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ paddingTop: 6 }}>
              <h3 style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Target size={16} color="#a78bfa" />{t.name}
              </h3>
              {t.description && <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{t.description}</p>}
            </div>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button className="btn btn-icon btn-ghost focus-ring" onClick={() => onEdit(t)} type="button" aria-label="Edit template" title="Edit"><Edit2 size={14} /></button>
                <button className="btn btn-icon btn-ghost focus-ring" onClick={() => onDelete(t.id)} type="button" aria-label="Archive template" title="Archive"><Trash2 size={14} /></button>
              </div>
            )}
          </div>
          <div className="template-criteria-list">
            {t.criteria.map((c) => (
              <div key={c.id} className="template-criterion-chip">
                <span style={{ color: 'var(--text-secondary)' }}>{c.label}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>1 – {c.maxScore}</span>
              </div>
            ))}
          </div>
          {t.documentUrl && (
            <a href={t.documentUrl} target="_blank" rel="noopener noreferrer" className="template-doc-link focus-ring">
              <Paperclip size={12} /><span>{t.documentName ?? 'Reference form'}</span>
            </a>
          )}
          {typeof t._count?.evaluations === 'number' && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <BarChart3 size={12} />Used in {t._count.evaluations} {t._count.evaluations === 1 ? 'evaluation' : 'evaluations'}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Detail Modal ──

function EvaluationDetailModal({
  evaluation, currentUser, onClose, onAcknowledge, onDelete, isAdmin,
}: {
  evaluation: Evaluation; currentUser: { id: string; role: string }
  onClose: () => void; onAcknowledge: () => void; onDelete: () => void; isAdmin: boolean
}) {
  const e = evaluation
  const isMine = e.agentId === currentUser.id
  const canAcknowledge = isMine && !e.acknowledgedAt && !e.isPrivate
  const overall = e.overallRating ?? 0
  const color = overall > 0 ? ratingColor(overall) : 'var(--text-muted)'
  const sortedScores = [...e.scores].sort((a, b) => a.criterion.order - b.criterion.order)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-scale-in eval-wide-modal" onClick={(ev) => ev.stopPropagation()}>
        <div style={{ height: 3, background: 'var(--brand-gradient)', borderRadius: '24px 24px 0 0' }} />
        <div className="modal-header" style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--brand-light)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
              {e.template.name}
            </div>
            <h3>{e.agent.name || 'Unnamed agent'}</h3>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Avatar user={e.evaluator} size={18} />
              Evaluated by {e.evaluator.name || 'unknown'} · {formatDateTime(e.createdAt)}
            </div>
          </div>
          <button className="btn btn-icon btn-ghost focus-ring" onClick={onClose} type="button" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="eval-modal-rating-banner">
            <div className="eval-modal-rating-ring" style={{
              background: `conic-gradient(${color} ${(overall / 5) * 360}deg, rgba(255,255,255,0.06) 0deg)`,
              boxShadow: overall > 0 ? `0 0 20px ${color}33` : 'none',
            }}>
              <div className="eval-modal-rating-inner" style={{ color: overall > 0 ? color : 'var(--text-muted)' }}>
                {overall > 0 ? `${overall}.0` : '—'}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 4 }}>Overall Rating</div>
              <StarRow value={overall} max={5} readOnly size={20} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {e.isPrivate && <span className="private-ribbon"><EyeOff size={11} /> Private</span>}
              {e.acknowledgedAt && <span className="ack-ribbon"><CheckCircle2 size={11} /> Acknowledged</span>}
            </div>
          </div>

          <div>
            <div className="label" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Target size={14} /> Criteria Breakdown</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sortedScores.map((s) => (
                <div key={s.id} className="criterion-row">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="criterion-label">{s.criterion.label}</div>
                      {s.criterion.description && <div className="criterion-description">{s.criterion.description}</div>}
                    </div>
                    <div style={{ minWidth: 150 }}>
                      <ScoreBar score={s.score} max={s.criterion.maxScore} color={ratingColor(s.score)} />
                    </div>
                  </div>
                  {s.comment && (
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', padding: '8px 10px', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', borderLeft: '2px solid var(--brand)' }}>
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
              <div style={{ padding: '12px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                {e.comments}
              </div>
            </div>
          )}

          {e.documentUrl && (
            <div>
              <div className="label">Attached Document</div>
              <a href={e.documentUrl} target="_blank" rel="noopener noreferrer" download={e.documentName ?? undefined} className="doc-attachment-card focus-ring">
                <div className="doc-attachment-icon"><FileText size={20} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="doc-attachment-name">{e.documentName ?? 'Evaluation document'}</div>
                  {typeof e.documentSize === 'number' && <div className="doc-attachment-meta">{formatBytes(e.documentSize)}</div>}
                </div>
                <Download size={16} style={{ color: 'var(--text-muted)' }} />
              </a>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--border-subtle)', justifyContent: 'space-between' }}>
          <div>{isAdmin && <button className="btn btn-danger focus-ring" onClick={onDelete} type="button"><Trash2 size={14} /> Delete</button>}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost focus-ring" onClick={onClose} type="button">Close</button>
            {canAcknowledge && <button className="btn btn-gradient focus-ring" onClick={onAcknowledge} type="button"><CheckCircle2 size={16} /> Acknowledge</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Create Evaluation Modal ──

function CreateEvaluationModal({
  templates, staffUsers, onClose, onCreated,
}: {
  templates: Template[]; staffUsers: UserLite[]; onClose: () => void; onCreated: () => void
}) {
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? '')
  const [agentId, setAgentId] = useState<string>(staffUsers[0]?.id ?? '')
  const [overallRating, setOverallRating] = useState(0)
  const [comments, setComments] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [scores, setScores] = useState<Record<string, { score: number; comment: string }>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [documentUrl, setDocumentUrl] = useState<string | null>(null)
  const [documentName, setDocumentName] = useState<string | null>(null)
  const [documentSize, setDocumentSize] = useState<number | null>(null)
  const [docUploading, setDocUploading] = useState(false)
  const docInputRef = useRef<HTMLInputElement>(null)

  async function handleDocUpload(file: File) {
    setDocUploading(true); setError(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/workryn/evaluations/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Upload failed')
      setDocumentUrl(data.url); setDocumentName(data.fileName); setDocumentSize(data.size)
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed') }
    finally { setDocUploading(false) }
  }

  function handleDocRemove() { setDocumentUrl(null); setDocumentName(null); setDocumentSize(null) }

  const template = templates.find((t) => t.id === templateId)
  function setScore(criterionId: string, score: number) { setScores((s) => ({ ...s, [criterionId]: { score, comment: s[criterionId]?.comment ?? '' } })) }
  function setScoreComment(criterionId: string, comment: string) { setScores((s) => ({ ...s, [criterionId]: { score: s[criterionId]?.score ?? 0, comment } })) }

  const canSubmit = !!templateId && !!agentId && !!template &&
    template.criteria.every((c) => { const v = scores[c.id]?.score ?? 0; return v >= 1 && v <= c.maxScore }) &&
    overallRating >= 1 && overallRating <= 5

  async function handleSubmit() {
    if (!canSubmit || !template) return
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/workryn/evaluations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId, agentId, overallRating, comments: comments.trim(), isPrivate,
          documentUrl, documentName, documentSize,
          scores: template.criteria.map((c) => ({ criterionId: c.id, score: scores[c.id]?.score ?? 0, comment: scores[c.id]?.comment?.trim() || null })),
        }),
      })
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data?.error || 'Failed to save evaluation') }
      onCreated()
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to save evaluation') }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-scale-in eval-wide-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ height: 3, background: 'var(--brand-gradient)', borderRadius: '24px 24px 0 0' }} />
        <div className="modal-header" style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Sparkles size={18} color="var(--brand-light)" /> New Evaluation</h3>
          <button className="btn btn-icon btn-ghost focus-ring" onClick={onClose} type="button" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
              <label className="label">Template *</label>
              <select className="input focus-ring" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setScores({}) }}>
                <option value="" disabled>Select a template…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
              <label className="label">Agent to evaluate *</label>
              <select className="input focus-ring" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                <option value="" disabled>Select a staff member…</option>
                {staffUsers.map((u) => <option key={u.id} value={u.id}>{u.name || u.email || u.id}</option>)}
              </select>
            </div>
          </div>

          {template && (
            <div>
              <div className="label" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><Target size={14} /> Score each criterion</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {template.criteria.map((c) => (
                  <div key={c.id} className="criterion-row">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div className="criterion-label">{c.label}</div>
                        {c.description && <div className="criterion-description">{c.description}</div>}
                      </div>
                      <StarRow value={scores[c.id]?.score ?? 0} max={c.maxScore} onChange={(n) => setScore(c.id, n)} size={18} />
                    </div>
                    <textarea className="criterion-comment-input" placeholder="Optional comment…" value={scores[c.id]?.comment ?? ''} onChange={(e) => setScoreComment(c.id, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ padding: '16px 18px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div className="label">Overall rating *</div>
              <StarRow value={overallRating} max={5} onChange={setOverallRating} size={22} />
            </div>
            <div className="form-group">
              <label className="label">Overall comments</label>
              <textarea className="input focus-ring" style={{ minHeight: 90, resize: 'vertical' }} placeholder="Summary, strengths, areas for growth…" value={comments} onChange={(e) => setComments(e.target.value)} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
              <EyeOff size={14} /> Mark as private (only visible to you and admins)
            </label>
            <div className="form-group" style={{ marginTop: 4 }}>
              <label className="label">Attached document (optional)</label>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 8px' }}>Upload a scanned or completed evaluation form. PDF, Word, Excel, or image up to 25 MB.</p>
              {documentUrl ? (
                <div className="doc-pill">
                  <FileText size={14} />
                  <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="doc-pill-name">{documentName ?? 'Document'}</a>
                  {typeof documentSize === 'number' && <span className="doc-pill-size">{formatBytes(documentSize)}</span>}
                  <button type="button" className="btn btn-icon btn-ghost btn-sm focus-ring" onClick={handleDocRemove} aria-label="Remove document" title="Remove"><X size={14} /></button>
                </div>
              ) : (
                <button type="button" className="btn btn-ghost focus-ring" onClick={() => docInputRef.current?.click()} disabled={docUploading}>
                  {docUploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                  {docUploading ? 'Uploading…' : 'Upload document'}
                </button>
              )}
              <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.odt,.ods,.rtf,.txt,.png,.jpg,.jpeg,.webp,.tiff,.tif" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocUpload(f); e.target.value = '' }} />
            </div>
          </div>

          {error && <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem' }}>{error}</div>}
        </div>

        <div className="modal-footer" style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--border-subtle)' }}>
          <button className="btn btn-ghost focus-ring" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-gradient focus-ring" onClick={handleSubmit} disabled={!canSubmit || saving} type="button">
            {saving ? <Loader2 size={16} className="spin" /> : <Zap size={16} />} Save Evaluation
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Template Builder Modal ──

type DraftCriterion = { id?: string; label: string; description: string; maxScore: number }

function TemplateBuilderModal({
  template, onClose, onSaved,
}: {
  template: Template | null; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [criteria, setCriteria] = useState<DraftCriterion[]>(
    template?.criteria.map((c) => ({ id: c.id, label: c.label, description: c.description ?? '', maxScore: c.maxScore })) ?? [{ label: '', description: '', maxScore: 5 }],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [documentUrl, setDocumentUrl] = useState<string | null>(template?.documentUrl ?? null)
  const [documentName, setDocumentName] = useState<string | null>(template?.documentName ?? null)
  const [documentSize, setDocumentSize] = useState<number | null>(template?.documentSize ?? null)
  const [docUploading, setDocUploading] = useState(false)
  const docInputRef = useRef<HTMLInputElement>(null)

  async function handleDocUpload(file: File) {
    setDocUploading(true); setError(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/workryn/evaluations/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Upload failed')
      setDocumentUrl(data.url); setDocumentName(data.fileName); setDocumentSize(data.size)
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed') }
    finally { setDocUploading(false) }
  }

  function handleDocRemove() { setDocumentUrl(null); setDocumentName(null); setDocumentSize(null) }
  function addCriterion() { setCriteria((c) => [...c, { label: '', description: '', maxScore: 5 }]) }
  function removeCriterion(i: number) { setCriteria((c) => c.filter((_, idx) => idx !== i)) }
  function updateCriterion(i: number, patch: Partial<DraftCriterion>) { setCriteria((c) => c.map((item, idx) => (idx === i ? { ...item, ...patch } : item))) }
  function move(i: number, dir: -1 | 1) {
    setCriteria((c) => { const next = [...c]; const target = i + dir; if (target < 0 || target >= next.length) return next; [next[i], next[target]] = [next[target], next[i]]; return next })
  }

  const canSubmit = name.trim().length > 0 && criteria.every((c) => c.label.trim().length > 0)

  async function handleSubmit() {
    if (!canSubmit) return
    setSaving(true); setError(null)
    try {
      const payload = {
        name: name.trim(), description: description.trim() || null,
        criteria: criteria.map((c, i) => ({ label: c.label.trim(), description: c.description.trim() || null, order: i, maxScore: c.maxScore })),
        documentUrl, documentName, documentSize,
      }
      const url = template ? `/api/evaluations/templates/${template.id}` : '/api/evaluations/templates'
      const method = template ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data?.error || 'Failed to save template') }
      onSaved()
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to save template') }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-scale-in eval-wide-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)', borderRadius: '24px 24px 0 0' }} />
        <div className="modal-header" style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ClipboardCheck size={18} color="#a78bfa" /> {template ? 'Edit Template' : 'New Template'}</h3>
          <button className="btn btn-icon btn-ghost focus-ring" onClick={onClose} type="button" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="label">Template name *</label>
            <input className="input focus-ring" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Quarterly Performance Review" autoFocus />
          </div>
          <div className="form-group">
            <label className="label">Description</label>
            <textarea className="input focus-ring" style={{ minHeight: 60, resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional: when this template should be used." />
          </div>

          <div className="form-group">
            <label className="label">Reference document (optional)</label>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 8px' }}>Attach the form your team normally uses (PDF, Word, Excel, image). Up to 25 MB.</p>
            {documentUrl ? (
              <div className="doc-pill">
                <FileText size={14} />
                <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="doc-pill-name">{documentName ?? 'Document'}</a>
                {typeof documentSize === 'number' && <span className="doc-pill-size">{formatBytes(documentSize)}</span>}
                <button type="button" className="btn btn-icon btn-ghost btn-sm focus-ring" onClick={handleDocRemove} aria-label="Remove document" title="Remove"><X size={14} /></button>
              </div>
            ) : (
              <button type="button" className="btn btn-ghost focus-ring" onClick={() => docInputRef.current?.click()} disabled={docUploading}>
                {docUploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                {docUploading ? 'Uploading…' : 'Upload document'}
              </button>
            )}
            <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.odt,.ods,.rtf,.txt,.png,.jpg,.jpeg,.webp,.tiff,.tif" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocUpload(f); e.target.value = '' }} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div className="label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}><Target size={14} /> Criteria</div>
              <button className="btn btn-ghost btn-sm focus-ring" onClick={addCriterion} type="button"><Plus size={14} /> Add</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {criteria.map((c, i) => (
                <div key={c.id ?? i} className="criterion-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <input className="input focus-ring" placeholder="Criterion label (e.g. Communication)" value={c.label} onChange={(e) => updateCriterion(i, { label: e.target.value })} style={{ height: 36, fontSize: '0.875rem' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>1 –</span>
                      <input className="input focus-ring" type="number" min={1} max={10} value={c.maxScore} onChange={(e) => updateCriterion(i, { maxScore: Math.max(1, Math.min(10, Number(e.target.value) || 5)) })} style={{ width: 64, height: 36, fontSize: '0.875rem' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="btn btn-icon btn-ghost focus-ring" type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">↑</button>
                      <button className="btn btn-icon btn-ghost focus-ring" type="button" onClick={() => move(i, 1)} disabled={i === criteria.length - 1} aria-label="Move down" title="Move down">↓</button>
                      <button className="btn btn-icon btn-ghost focus-ring" type="button" onClick={() => removeCriterion(i)} disabled={criteria.length <= 1} aria-label="Remove criterion" title="Remove"><X size={14} /></button>
                    </div>
                  </div>
                  <textarea className="criterion-comment-input" placeholder="Optional description for this criterion" value={c.description} onChange={(e) => updateCriterion(i, { description: e.target.value })} />
                </div>
              ))}
            </div>
          </div>

          {error && <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem' }}>{error}</div>}
        </div>

        <div className="modal-footer" style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--border-subtle)' }}>
          <button className="btn btn-ghost focus-ring" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-gradient focus-ring" onClick={handleSubmit} disabled={!canSubmit || saving} type="button">
            {saving ? <Loader2 size={16} className="spin" /> : <ClipboardCheck size={16} />} Save Template
          </button>
        </div>
      </div>
    </div>
  )
}

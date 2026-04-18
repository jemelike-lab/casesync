'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BookOpen, Plus, Search, Clock, CheckCircle2, Star, Loader2, X,
  PlayCircle, HelpCircle, Users,
} from 'lucide-react'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

type Course = {
  id: string
  title: string
  description: string | null
  thumbnail: string | null
  category: string | null
  isRequired: boolean
  isPublished: boolean
  passThreshold: number
  createdAt: string
  createdBy: { id: string; name: string | null; avatarColor: string }
  _count: { lessons: number; quizzes: number; enrollments: number }
}

type Enrollment = {
  id: string
  courseId: string
  status: string
  enrolledAt: string
  completedAt: string | null
}

interface Props {
  initialCourses: Course[]
  initialEnrollments: Enrollment[]
  currentUser: { id: string; role: string }
}

type FilterTab = 'ALL' | 'MINE' | 'REQUIRED' | 'COMPLETED'

export default function TrainingClient({ initialCourses, initialEnrollments, currentUser }: Props) {
  const router = useRouter()
  const [courses, setCourses] = useState<Course[]>(initialCourses)
  const [enrollments] = useState<Enrollment[]>(initialEnrollments)
  const [tab, setTab] = useState<FilterTab>('ALL')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    isRequired: false,
    passThreshold: 70,
    isPublished: false,
  })

  const canCreate = isManagerOrAbove(currentUser.role)

  const enrollmentByCourse = useMemo(() => {
    const map = new Map<string, Enrollment>()
    enrollments.forEach(e => map.set(e.courseId, e))
    return map
  }, [enrollments])

  const stats = useMemo(() => {
    const required = courses.filter(c => c.isRequired).length
    const inProgress = enrollments.filter(e => e.status === 'IN_PROGRESS').length
    const completed = enrollments.filter(e => e.status === 'COMPLETED').length
    return { required, inProgress, completed }
  }, [courses, enrollments])

  const filtered = useMemo(() => {
    return courses.filter(c => {
      if (search) {
        const q = search.toLowerCase()
        const matches =
          c.title.toLowerCase().includes(q) ||
          (c.description ?? '').toLowerCase().includes(q) ||
          (c.category ?? '').toLowerCase().includes(q)
        if (!matches) return false
      }
      const enrollment = enrollmentByCourse.get(c.id)
      switch (tab) {
        case 'MINE':
          return Boolean(enrollment)
        case 'REQUIRED':
          return c.isRequired
        case 'COMPLETED':
          return enrollment?.status === 'COMPLETED'
        default:
          return true
      }
    })
  }, [courses, tab, search, enrollmentByCourse])

  async function handleCreate() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/workryn/training/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to create course')
        return
      }
      const created = await res.json()
      setCourses(prev => [created, ...prev])
      setShowCreate(false)
      setForm({ title: '', description: '', category: '', isRequired: false, passThreshold: 70, isPublished: false })
      // Navigate into the builder to add lessons/quizzes
      router.push(`/w/training/builder?courseId=${created.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="page-header" style={{ padding: '24px 32px 20px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
          <div>
            <h1 className="gradient-text" style={{ marginBottom: 4 }}>Training Center</h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Learn, grow, and stay compliant with courses, quizzes, and video modules.
            </p>
          </div>
          {canCreate && (
            <button
              className="btn btn-gradient focus-ring"
              onClick={() => setShowCreate(true)}
              id="btn-create-course"
            >
              <Plus size={18} /> Create Course
            </button>
          )}
        </div>

        {/* Stat cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
            marginBottom: 20,
          }}
        >
          <StatCard label="Required Courses" value={stats.required} icon={<Star size={18} />} accent="#f59e0b" />
          <StatCard label="In Progress" value={stats.inProgress} icon={<Clock size={18} />} accent="#6366f1" />
          <StatCard label="Completed" value={stats.completed} icon={<CheckCircle2 size={18} />} accent="#10b981" />
        </div>

        {/* Tabs */}
        <div className="flex gap-2" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
          {(['ALL', 'MINE', 'REQUIRED', 'COMPLETED'] as FilterTab[]).map(t => (
            <button
              key={t}
              className={`training-tab focus-ring ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {tabLabel(t)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="glass-card" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
          <div style={{ position: 'relative', maxWidth: 420 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="input focus-ring"
              style={{ paddingLeft: 34, height: 36, fontSize: '0.875rem' }}
              placeholder="Search courses..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="page-body" style={{ paddingTop: 20 }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <BookOpen size={40} />
            <p>No courses found</p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 18,
            }}
          >
            {filtered.map(course => {
              const enrollment = enrollmentByCourse.get(course.id)
              return (
                <CourseCard
                  key={course.id}
                  course={course}
                  enrollment={enrollment}
                />
              )
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div style={{ height: 3, background: 'var(--brand-gradient)', borderRadius: '24px 24px 0 0' }} />
            <div className="modal-header" style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
              <h3>Create Course</h3>
              <button className="btn btn-icon btn-ghost focus-ring" onClick={() => setShowCreate(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="label">Title *</label>
                <input
                  className="input focus-ring"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. HIPAA Compliance Basics"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="label">Description</label>
                <textarea
                  className="input focus-ring"
                  style={{ minHeight: 80, resize: 'vertical' }}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Short summary of what learners will gain..."
                />
              </div>
              <div className="flex gap-3">
                <div className="form-group flex-1">
                  <label className="label">Category</label>
                  <input
                    className="input focus-ring"
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="e.g. Compliance"
                  />
                </div>
                <div className="form-group" style={{ width: 140 }}>
                  <label className="label">Pass %</label>
                  <input
                    className="input focus-ring"
                    type="number"
                    min={0}
                    max={100}
                    value={form.passThreshold}
                    onChange={e => setForm(f => ({ ...f, passThreshold: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.isRequired}
                    onChange={e => setForm(f => ({ ...f, isRequired: e.target.checked }))}
                  />
                  <span>Required for all staff</span>
                </label>
                <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.isPublished}
                    onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))}
                  />
                  <span>Publish immediately</span>
                </label>
              </div>
            </div>
            <div className="modal-footer" style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--border-subtle)' }}>
              <button className="btn btn-ghost focus-ring" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-gradient focus-ring" onClick={handleCreate} disabled={saving || !form.title.trim()}>
                {saving ? <Loader2 size={16} className="spin" /> : 'Create & Build'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .training-tab {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          padding: 7px 14px;
          font-size: 0.8125rem;
          font-weight: 600;
          border-radius: 99px;
          cursor: pointer;
          transition: all var(--transition-smooth);
        }
        .training-tab:hover {
          background: var(--glass-bg);
          color: var(--text-primary);
        }
        .training-tab.active {
          background: var(--brand-gradient);
          color: #fff;
          border-color: transparent;
          box-shadow: var(--shadow-glow);
        }
      `}</style>
    </>
  )
}

function tabLabel(t: FilterTab): string {
  switch (t) {
    case 'ALL': return 'All Courses'
    case 'MINE': return 'My Courses'
    case 'REQUIRED': return 'Required'
    case 'COMPLETED': return 'Completed'
  }
}

function StatCard({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent: string }) {
  return (
    <div
      className="glass-card"
      style={{
        padding: '16px 18px',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 'var(--radius-md)',
          background: `${accent}22`,
          color: accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${accent}44`,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          {label}
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
      </div>
    </div>
  )
}

function CourseCard({ course, enrollment }: { course: Course; enrollment: Enrollment | undefined }) {
  const isCompleted = enrollment?.status === 'COMPLETED'
  const isInProgress = enrollment?.status === 'IN_PROGRESS'

  return (
    <Link
      href={`/w/training/courses/${course.id}`}
      style={{ textDecoration: 'none' }}
    >
      <div
        className="glass-card course-card"
        style={{
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          transition: 'all var(--transition-smooth)',
        }}
      >
        {/* Thumbnail */}
        <div
          style={{
            height: 130,
            background: course.thumbnail
              ? `url(${course.thumbnail}) center/cover`
              : 'var(--brand-gradient)',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {!course.thumbnail && (
            <BookOpen size={42} color="rgba(255,255,255,0.6)" />
          )}
          {course.isRequired && (
            <span
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                background: '#f59e0bcc',
                color: '#fff',
                padding: '3px 10px',
                borderRadius: 99,
                fontSize: '0.6875rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Star size={11} /> Required
            </span>
          )}
          {!course.isPublished && (
            <span
              style={{
                position: 'absolute',
                top: 10,
                left: 10,
                background: 'rgba(0,0,0,0.55)',
                color: '#fff',
                padding: '3px 10px',
                borderRadius: 99,
                fontSize: '0.6875rem',
                fontWeight: 600,
              }}
            >
              Draft
            </span>
          )}
          {isCompleted && (
            <span
              style={{
                position: 'absolute',
                bottom: 10,
                right: 10,
                background: '#10b981',
                color: '#fff',
                padding: '3px 10px',
                borderRadius: 99,
                fontSize: '0.6875rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <CheckCircle2 size={11} /> Completed
            </span>
          )}
        </div>

        <div style={{ padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {course.category && (
            <div
              style={{
                fontSize: '0.6875rem',
                color: 'var(--brand-light, #a5b4fc)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {course.category}
            </div>
          )}
          <div
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              lineHeight: 1.3,
            }}
          >
            {course.title}
          </div>
          {course.description && (
            <div
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
              {course.description}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginTop: 'auto',
              paddingTop: 10,
              borderTop: '1px solid var(--border-subtle)',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <PlayCircle size={13} /> {course._count.lessons}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <HelpCircle size={13} /> {course._count.quizzes}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Users size={13} /> {course._count.enrollments}
            </span>
          </div>

          {isInProgress && (
            <div
              style={{
                background: '#6366f122',
                color: '#a5b4fc',
                padding: '4px 10px',
                borderRadius: 99,
                fontSize: '0.6875rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                textAlign: 'center',
              }}
            >
              In Progress
            </div>
          )}
        </div>
      </div>
      <style>{`
        .course-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md), 0 0 20px rgba(99,102,241,0.1);
          border-color: var(--glass-border);
        }
      `}</style>
    </Link>
  )
}

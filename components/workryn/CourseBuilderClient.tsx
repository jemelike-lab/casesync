'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ChevronLeft, Plus, Trash2, X, Loader2, Upload, ChevronUp, ChevronDown,
  Save, Rocket, BookOpen, PlayCircle, HelpCircle, Pencil,
} from 'lucide-react'

type Lesson = {
  id: string
  title: string
  content: string
  videoUrl: string | null
  videoFileName: string | null
  durationSeconds: number | null
  order: number
}

type Option = {
  id?: string
  text: string
  isCorrect: boolean
  order: number
}

type Question = {
  id: string
  text: string
  type: string
  points: number
  order: number
  options: Option[]
}

type Quiz = {
  id: string
  title: string
  description: string | null
  passThreshold: number
  questions: Question[]
}

type Course = {
  id: string
  title: string
  description: string | null
  category: string | null
  isRequired: boolean
  isPublished: boolean
  passThreshold: number
}

interface Props {
  currentUser: { id: string; role: string }
}

export default function CourseBuilderClient({ currentUser: _currentUser }: Props) {
  void _currentUser
  const router = useRouter()
  const searchParams = useSearchParams()
  const courseId = searchParams.get('courseId')

  const [loading, setLoading] = useState(Boolean(courseId))
  const [saving, setSaving] = useState(false)

  const [course, setCourse] = useState<Course>({
    id: '',
    title: '',
    description: '',
    category: '',
    isRequired: false,
    isPublished: false,
    passThreshold: 70,
  })
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [quizzes, setQuizzes] = useState<Quiz[]>([])

  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null)
  const [showNewLesson, setShowNewLesson] = useState(false)
  const [showNewQuiz, setShowNewQuiz] = useState(false)
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null)

  const loadCourse = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/workryn/training/courses/${id}`)
      if (!res.ok) {
        alert('Course not found')
        router.push('/w/training')
        return
      }
      const data = await res.json()
      setCourse({
        id: data.id,
        title: data.title,
        description: data.description ?? '',
        category: data.category ?? '',
        isRequired: data.isRequired,
        isPublished: data.isPublished,
        passThreshold: data.passThreshold,
      })
      setLessons(data.lessons || [])
      // Load full quizzes with questions
      const loadedQuizzes: Quiz[] = []
      for (const q of data.quizzes || []) {
        const qres = await fetch(`/api/workryn/training/quizzes/${q.id}`)
        if (qres.ok) {
          const full = await qres.json()
          loadedQuizzes.push({
            id: full.id,
            title: full.title,
            description: full.description,
            passThreshold: full.passThreshold,
            questions: full.questions || [],
          })
        }
      }
      setQuizzes(loadedQuizzes)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (courseId) loadCourse(courseId)
  }, [courseId, loadCourse])

  async function saveCourseMeta(publish?: boolean) {
    if (!course.title.trim()) {
      alert('Title is required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: course.title.trim(),
        description: course.description,
        category: course.category,
        isRequired: course.isRequired,
        isPublished: publish !== undefined ? publish : course.isPublished,
        passThreshold: course.passThreshold,
      }
      if (course.id) {
        const res = await fetch(`/api/workryn/training/courses/${course.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) { alert('Failed to save course'); return }
        const data = await res.json()
        setCourse(c => ({ ...c, ...data }))
      } else {
        const res = await fetch('/api/workryn/training/courses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) { alert('Failed to create course'); return }
        const data = await res.json()
        setCourse(c => ({ ...c, id: data.id, isPublished: data.isPublished }))
        router.replace(`/training/builder?courseId=${data.id}`)
      }
    } finally {
      setSaving(false)
    }
  }

  async function moveLesson(id: string, dir: -1 | 1) {
    const sorted = [...lessons].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex(l => l.id === id)
    if (idx < 0) return
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= sorted.length) return
    const a = sorted[idx]
    const b = sorted[newIdx]
    const [aNewOrder, bNewOrder] = [b.order, a.order]
    setLessons(prev => prev.map(l => {
      if (l.id === a.id) return { ...l, order: aNewOrder }
      if (l.id === b.id) return { ...l, order: bNewOrder }
      return l
    }))
    await Promise.all([
      fetch(`/api/workryn/training/lessons/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: aNewOrder }),
      }),
      fetch(`/api/workryn/training/lessons/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: bNewOrder }),
      }),
    ])
  }

  async function handleDeleteLesson(id: string) {
    if (!confirm('Delete this lesson?')) return
    const res = await fetch(`/api/workryn/training/lessons/${id}`, { method: 'DELETE' })
    if (res.ok) setLessons(prev => prev.filter(l => l.id !== id))
  }

  function onLessonSaved(l: Lesson, isNew: boolean) {
    setLessons(prev => {
      if (isNew) return [...prev, l].sort((a, b) => a.order - b.order)
      return prev.map(x => x.id === l.id ? { ...x, ...l } : x)
    })
  }

  async function handleDeleteQuiz(id: string) {
    if (!confirm('Delete this quiz?')) return
    const res = await fetch(`/api/workryn/training/quizzes/${id}`, { method: 'DELETE' })
    if (res.ok) setQuizzes(prev => prev.filter(q => q.id !== id))
  }

  function onQuizSaved(q: Quiz, isNew: boolean) {
    setQuizzes(prev => {
      if (isNew) return [...prev, q]
      return prev.map(x => x.id === q.id ? q : x)
    })
  }

  if (loading) {
    return (
      <div className="page-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <Loader2 size={24} className="spin" />
      </div>
    )
  }

  const sortedLessons = [...lessons].sort((a, b) => a.order - b.order)

  return (
    <>
      <div style={{ padding: '16px 32px 0' }}>
        <Link
          href="/w/training"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--text-muted)',
            textDecoration: 'none',
            fontSize: '0.8125rem',
            marginBottom: 14,
          }}
        >
          <ChevronLeft size={15} /> Back to Training
        </Link>
      </div>

      <div className="page-header" style={{ padding: '0 32px 20px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="gradient-text" style={{ marginBottom: 4 }}>
              {course.id ? 'Edit Course' : 'New Course'}
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Build lessons, quizzes, and set learning requirements.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost focus-ring" onClick={() => saveCourseMeta(false)} disabled={saving || !course.title.trim()}>
              {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Save Draft
            </button>
            <button className="btn btn-gradient focus-ring" onClick={() => saveCourseMeta(true)} disabled={saving || !course.title.trim()}>
              <Rocket size={16} /> Save & Publish
            </button>
          </div>
        </div>
      </div>

      <div className="page-body" style={{ paddingTop: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Course metadata */}
        <section className="glass-card" style={{ padding: '20px 24px', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={18} /> Course Info
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="label">Title *</label>
              <input
                className="input focus-ring"
                value={course.title}
                onChange={e => setCourse(c => ({ ...c, title: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="label">Description</label>
              <textarea
                className="input focus-ring"
                style={{ minHeight: 80, resize: 'vertical' }}
                value={course.description ?? ''}
                onChange={e => setCourse(c => ({ ...c, description: e.target.value }))}
              />
            </div>
            <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
                <label className="label">Category</label>
                <input
                  className="input focus-ring"
                  value={course.category ?? ''}
                  onChange={e => setCourse(c => ({ ...c, category: e.target.value }))}
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
                  value={course.passThreshold}
                  onChange={e => setCourse(c => ({ ...c, passThreshold: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
              <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={course.isRequired}
                  onChange={e => setCourse(c => ({ ...c, isRequired: e.target.checked }))}
                />
                <span>Required for all staff</span>
              </label>
              <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={course.isPublished}
                  onChange={e => setCourse(c => ({ ...c, isPublished: e.target.checked }))}
                />
                <span>Published</span>
              </label>
            </div>
          </div>
        </section>

        {/* Lessons */}
        <section className="glass-card" style={{ padding: '20px 24px', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <PlayCircle size={18} /> Lessons ({sortedLessons.length})
            </h3>
            <button
              className="btn btn-gradient focus-ring"
              onClick={() => {
                if (!course.id) { alert('Save the course first'); return }
                setShowNewLesson(true)
              }}
            >
              <Plus size={16} /> Add Lesson
            </button>
          </div>
          {sortedLessons.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {course.id ? 'No lessons yet. Click "Add Lesson" to start.' : 'Save the course first to add lessons.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sortedLessons.map((l, i) => (
                <div
                  key={l.id}
                  style={{
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button
                      className="btn btn-icon btn-ghost focus-ring"
                      style={{ padding: 2, height: 'auto', minHeight: 0 }}
                      onClick={() => moveLesson(l.id, -1)}
                      disabled={i === 0}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      className="btn btn-icon btn-ghost focus-ring"
                      style={{ padding: 2, height: 'auto', minHeight: 0 }}
                      onClick={() => moveLesson(l.id, 1)}
                      disabled={i === sortedLessons.length - 1}
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
                      {i + 1}. {l.title}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: 10 }}>
                      {l.videoUrl && <span>Video: {l.videoFileName ?? 'attached'}</span>}
                      {l.content && <span>{l.content.length} chars</span>}
                    </div>
                  </div>
                  <button
                    className="btn btn-icon btn-ghost focus-ring"
                    onClick={() => setEditingLesson(l)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="btn btn-icon btn-ghost focus-ring"
                    onClick={() => handleDeleteLesson(l.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Quizzes */}
        <section className="glass-card" style={{ padding: '20px 24px', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <HelpCircle size={18} /> Quizzes ({quizzes.length})
            </h3>
            <button
              className="btn btn-gradient focus-ring"
              onClick={() => {
                if (!course.id) { alert('Save the course first'); return }
                setShowNewQuiz(true)
              }}
            >
              <Plus size={16} /> Add Quiz
            </button>
          </div>
          {quizzes.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {course.id ? 'No quizzes yet.' : 'Save the course first to add quizzes.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {quizzes.map(q => (
                <div
                  key={q.id}
                  style={{
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
                      {q.title}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {q.questions.length} questions · Pass {q.passThreshold}%
                    </div>
                  </div>
                  <button className="btn btn-ghost focus-ring" onClick={() => setEditingQuiz(q)}>
                    <Pencil size={14} /> Edit
                  </button>
                  <button className="btn btn-icon btn-ghost focus-ring" onClick={() => handleDeleteQuiz(q.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {showNewLesson && course.id && (
        <LessonEditor
          courseId={course.id}
          lesson={null}
          nextOrder={sortedLessons.length}
          onClose={() => setShowNewLesson(false)}
          onSaved={(l) => { onLessonSaved(l, true); setShowNewLesson(false) }}
        />
      )}
      {editingLesson && course.id && (
        <LessonEditor
          courseId={course.id}
          lesson={editingLesson}
          nextOrder={editingLesson.order}
          onClose={() => setEditingLesson(null)}
          onSaved={(l) => { onLessonSaved(l, false); setEditingLesson(null) }}
        />
      )}

      {showNewQuiz && course.id && (
        <QuizEditor
          courseId={course.id}
          quiz={null}
          onClose={() => setShowNewQuiz(false)}
          onSaved={(q) => { onQuizSaved(q, true); setShowNewQuiz(false) }}
        />
      )}
      {editingQuiz && course.id && (
        <QuizEditor
          courseId={course.id}
          quiz={editingQuiz}
          onClose={() => setEditingQuiz(null)}
          onSaved={(q) => { onQuizSaved(q, false); setEditingQuiz(null) }}
        />
      )}
    </>
  )
}

function LessonEditor({
  courseId,
  lesson,
  nextOrder,
  onClose,
  onSaved,
}: {
  courseId: string
  lesson: Lesson | null
  nextOrder: number
  onClose: () => void
  onSaved: (lesson: Lesson) => void
}) {
  const [title, setTitle] = useState(lesson?.title ?? '')
  const [content, setContent] = useState(lesson?.content ?? '')
  const [videoUrl, setVideoUrl] = useState(lesson?.videoUrl ?? '')
  const [videoFileName, setVideoFileName] = useState(lesson?.videoFileName ?? '')
  const [order, setOrder] = useState<number>(lesson?.order ?? nextOrder)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/workryn/training/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Upload failed')
        return
      }
      const data = await res.json()
      setVideoUrl(data.url)
      setVideoFileName(data.fileName)
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        content,
        videoUrl: videoUrl || null,
        videoFileName: videoFileName || null,
        order,
      }
      const url = lesson
        ? `/api/training/lessons/${lesson.id}`
        : `/api/training/courses/${courseId}/lessons`
      const res = await fetch(url, {
        method: lesson ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        alert('Failed to save lesson')
        return
      }
      const saved = await res.json()
      onSaved(saved)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 3, background: 'var(--brand-gradient)', borderRadius: '24px 24px 0 0' }} />
        <div className="modal-header" style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3>{lesson ? 'Edit Lesson' : 'New Lesson'}</h3>
          <button className="btn btn-icon btn-ghost focus-ring" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          <div className="form-group">
            <label className="label">Title *</label>
            <input className="input focus-ring" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label className="label">Content (markdown — supports **bold**, *italic*, `code`, # heading)</label>
            <textarea
              className="input focus-ring"
              style={{ minHeight: 220, resize: 'vertical', fontFamily: 'inherit' }}
              value={content}
              onChange={e => setContent(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="label">Video</label>
            {videoUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {videoFileName || videoUrl}
                </div>
                <button
                  className="btn btn-ghost focus-ring"
                  onClick={() => { setVideoUrl(''); setVideoFileName('') }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp4,.webm,.mov,.avi,.mkv,.m4v,video/*"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleUpload(f)
                  }}
                />
                <button
                  className="btn btn-ghost focus-ring"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <><Loader2 size={16} className="spin" /> Uploading...</> : <><Upload size={16} /> Upload Video</>}
                </button>
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="label">Order</label>
            <input
              className="input focus-ring"
              type="number"
              value={order}
              onChange={e => setOrder(Number(e.target.value))}
              style={{ maxWidth: 120 }}
            />
          </div>
        </div>
        <div className="modal-footer" style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--border-subtle)' }}>
          <button className="btn btn-ghost focus-ring" onClick={onClose}>Cancel</button>
          <button className="btn btn-gradient focus-ring" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? <Loader2 size={16} className="spin" /> : 'Save Lesson'}
          </button>
        </div>
      </div>
    </div>
  )
}

function QuizEditor({
  courseId,
  quiz,
  onClose,
  onSaved,
}: {
  courseId: string
  quiz: Quiz | null
  onClose: () => void
  onSaved: (quiz: Quiz) => void
}) {
  const [title, setTitle] = useState(quiz?.title ?? '')
  const [description, setDescription] = useState(quiz?.description ?? '')
  const [passThreshold, setPassThreshold] = useState<number>(quiz?.passThreshold ?? 70)
  const [quizId, setQuizId] = useState<string>(quiz?.id ?? '')
  const [questions, setQuestions] = useState<Question[]>(quiz?.questions ?? [])
  const [saving, setSaving] = useState(false)
  const [addingQuestion, setAddingQuestion] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)

  async function ensureQuizSaved(): Promise<string | null> {
    if (quizId) {
      // Update metadata
      const res = await fetch(`/api/workryn/training/quizzes/${quizId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description, passThreshold }),
      })
      if (!res.ok) { alert('Failed to save quiz'); return null }
      return quizId
    }
    // Create
    const res = await fetch(`/api/workryn/training/courses/${courseId}/quizzes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), description, passThreshold }),
    })
    if (!res.ok) { alert('Failed to create quiz'); return null }
    const data = await res.json()
    setQuizId(data.id)
    return data.id
  }

  async function handleSaveAndClose() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const id = await ensureQuizSaved()
      if (!id) return
      onSaved({
        id,
        title: title.trim(),
        description: description || null,
        passThreshold,
        questions,
      })
    } finally {
      setSaving(false)
    }
  }

  function onQuestionSaved(q: Question, isNew: boolean) {
    setQuestions(prev => {
      if (isNew) return [...prev, q]
      return prev.map(x => x.id === q.id ? q : x)
    })
  }

  async function handleDeleteQuestion(id: string) {
    if (!confirm('Delete this question?')) return
    const res = await fetch(`/api/workryn/training/questions/${id}`, { method: 'DELETE' })
    if (res.ok) setQuestions(prev => prev.filter(q => q.id !== id))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 780, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 3, background: 'var(--brand-gradient)', borderRadius: '24px 24px 0 0' }} />
        <div className="modal-header" style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3>{quizId ? 'Edit Quiz' : 'New Quiz'}</h3>
          <button className="btn btn-icon btn-ghost focus-ring" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          <div className="form-group">
            <label className="label">Title *</label>
            <input className="input focus-ring" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label className="label">Description</label>
            <textarea
              className="input focus-ring"
              style={{ minHeight: 60, resize: 'vertical' }}
              value={description ?? ''}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ width: 140 }}>
            <label className="label">Pass %</label>
            <input
              className="input focus-ring"
              type="number"
              min={0}
              max={100}
              value={passThreshold}
              onChange={e => setPassThreshold(Number(e.target.value))}
            />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>Questions ({questions.length})</div>
              <button
                className="btn btn-ghost focus-ring"
                onClick={async () => {
                  const id = await ensureQuizSaved()
                  if (!id) return
                  setAddingQuestion(true)
                }}
                disabled={!title.trim()}
              >
                <Plus size={15} /> Add Question
              </button>
            </div>
            {questions.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                No questions yet. Click "Add Question" to create one.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {questions.map((q, i) => (
                  <div
                    key={q.id}
                    style={{
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {i + 1}. {q.text || <em style={{ color: 'var(--text-muted)' }}>(untitled)</em>}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {q.type.replace('_', ' ')} · {q.options.length} options · {q.points} pt
                      </div>
                    </div>
                    <button className="btn btn-icon btn-ghost focus-ring" onClick={() => setEditingQuestion(q)}>
                      <Pencil size={13} />
                    </button>
                    <button className="btn btn-icon btn-ghost focus-ring" onClick={() => handleDeleteQuestion(q.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer" style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--border-subtle)' }}>
          <button className="btn btn-ghost focus-ring" onClick={onClose}>Close</button>
          <button className="btn btn-gradient focus-ring" onClick={handleSaveAndClose} disabled={saving || !title.trim()}>
            {saving ? <Loader2 size={16} className="spin" /> : 'Save Quiz'}
          </button>
        </div>
      </div>

      {addingQuestion && quizId && (
        <QuestionEditor
          quizId={quizId}
          question={null}
          onClose={() => setAddingQuestion(false)}
          onSaved={(q) => { onQuestionSaved(q, true); setAddingQuestion(false) }}
        />
      )}
      {editingQuestion && (
        <QuestionEditor
          quizId={quizId}
          question={editingQuestion}
          onClose={() => setEditingQuestion(null)}
          onSaved={(q) => { onQuestionSaved(q, false); setEditingQuestion(null) }}
        />
      )}
    </div>
  )
}

function QuestionEditor({
  quizId,
  question,
  onClose,
  onSaved,
}: {
  quizId: string
  question: Question | null
  onClose: () => void
  onSaved: (question: Question) => void
}) {
  const [text, setText] = useState(question?.text ?? '')
  const [type, setType] = useState<string>(question?.type ?? 'MULTIPLE_CHOICE')
  const [points, setPoints] = useState<number>(question?.points ?? 1)
  const [options, setOptions] = useState<Option[]>(() => {
    if (question?.options?.length) return question.options.map(o => ({ ...o }))
    if (question?.type === 'TRUE_FALSE') {
      return [
        { text: 'True', isCorrect: false, order: 0 },
        { text: 'False', isCorrect: false, order: 1 },
      ]
    }
    return [
      { text: '', isCorrect: false, order: 0 },
      { text: '', isCorrect: false, order: 1 },
    ]
  })
  const [saving, setSaving] = useState(false)

  function onTypeChange(newType: string) {
    setType(newType)
    if (newType === 'TRUE_FALSE') {
      setOptions([
        { text: 'True', isCorrect: false, order: 0 },
        { text: 'False', isCorrect: false, order: 1 },
      ])
    } else if (options.length < 2) {
      setOptions([
        { text: '', isCorrect: false, order: 0 },
        { text: '', isCorrect: false, order: 1 },
      ])
    }
  }

  function addOption() {
    setOptions(o => [...o, { text: '', isCorrect: false, order: o.length }])
  }
  function removeOption(idx: number) {
    setOptions(o => o.filter((_, i) => i !== idx).map((x, i) => ({ ...x, order: i })))
  }
  function updateOption(idx: number, patch: Partial<Option>) {
    setOptions(o => o.map((x, i) => i === idx ? { ...x, ...patch } : x))
  }
  function toggleCorrect(idx: number) {
    if (type === 'MULTIPLE_CHOICE_MULTI') {
      updateOption(idx, { isCorrect: !options[idx].isCorrect })
    } else {
      setOptions(o => o.map((x, i) => ({ ...x, isCorrect: i === idx })))
    }
  }

  async function handleSave() {
    if (!text.trim()) return
    if (options.length < 2) { alert('At least 2 options required'); return }
    if (!options.some(o => o.isCorrect)) { alert('Mark at least one option as correct'); return }

    setSaving(true)
    try {
      const payload = {
        text: text.trim(),
        type,
        points,
        options: options.map((o, i) => ({ text: o.text.trim(), isCorrect: o.isCorrect, order: i })),
      }
      const url = question
        ? `/api/training/questions/${question.id}`
        : `/api/training/quizzes/${quizId}/questions`
      const res = await fetch(url, {
        method: question ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to save question')
        return
      }
      const saved = await res.json()
      onSaved(saved)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 3, background: 'var(--brand-gradient)', borderRadius: '24px 24px 0 0' }} />
        <div className="modal-header" style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3>{question ? 'Edit Question' : 'New Question'}</h3>
          <button className="btn btn-icon btn-ghost focus-ring" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          <div className="form-group">
            <label className="label">Question text *</label>
            <textarea
              className="input focus-ring"
              style={{ minHeight: 70, resize: 'vertical' }}
              value={text}
              onChange={e => setText(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="label">Type</label>
              <select
                className="input focus-ring"
                value={type}
                onChange={e => onTypeChange(e.target.value)}
              >
                <option value="MULTIPLE_CHOICE">Multiple Choice (single answer)</option>
                <option value="MULTIPLE_CHOICE_MULTI">Multiple Choice (multiple answers)</option>
                <option value="TRUE_FALSE">True / False</option>
              </select>
            </div>
            <div className="form-group" style={{ width: 110 }}>
              <label className="label">Points</label>
              <input
                className="input focus-ring"
                type="number"
                min={0}
                value={points}
                onChange={e => setPoints(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="label">
              Options {type === 'MULTIPLE_CHOICE_MULTI' ? '(check all correct)' : '(pick the correct one)'}
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {options.map((o, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type={type === 'MULTIPLE_CHOICE_MULTI' ? 'checkbox' : 'radio'}
                    name="correct-option"
                    checked={o.isCorrect}
                    onChange={() => toggleCorrect(i)}
                    title="Mark as correct"
                  />
                  <input
                    className="input focus-ring"
                    style={{ flex: 1 }}
                    value={o.text}
                    disabled={type === 'TRUE_FALSE'}
                    onChange={e => updateOption(i, { text: e.target.value })}
                    placeholder={`Option ${i + 1}`}
                  />
                  {type !== 'TRUE_FALSE' && options.length > 2 && (
                    <button className="btn btn-icon btn-ghost focus-ring" onClick={() => removeOption(i)}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {type !== 'TRUE_FALSE' && (
              <button className="btn btn-ghost focus-ring" style={{ marginTop: 10 }} onClick={addOption}>
                <Plus size={14} /> Add Option
              </button>
            )}
          </div>
        </div>
        <div className="modal-footer" style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--border-subtle)' }}>
          <button className="btn btn-ghost focus-ring" onClick={onClose}>Cancel</button>
          <button className="btn btn-gradient focus-ring" onClick={handleSave} disabled={saving || !text.trim()}>
            {saving ? <Loader2 size={16} className="spin" /> : 'Save Question'}
          </button>
        </div>
      </div>
    </div>
  )
}

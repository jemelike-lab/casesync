'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, CheckCircle2, Circle, Pencil, Plus, Trash2, X, Loader2,
  PlayCircle, HelpCircle, Star, Clock, Award, Settings, Upload,
} from 'lucide-react'
import { isManagerOrAbove } from '@/lib/workryn/permissions'

type Lesson = {
  id: string
  title: string
  content: string
  videoUrl: string | null
  videoFileName: string | null
  durationSeconds: number | null
  order: number
  progress: { id: string; completed: boolean; watchedSeconds: number }[]
}

type QuizSummary = {
  id: string
  title: string
  description: string | null
  passThreshold: number
  _count: { questions: number }
}

type Course = {
  id: string
  title: string
  description: string | null
  category: string | null
  isRequired: boolean
  isPublished: boolean
  passThreshold: number
  lessons: Lesson[]
  quizzes: QuizSummary[]
  createdBy: { id: string; name: string | null; avatarColor: string }
}

type Attempt = {
  id: string
  quizId: string
  score: number
  passed: boolean
  startedAt: string
  completedAt: string | null
}

type Enrollment = {
  id: string
  status: string
  completedAt: string | null
} | null

interface Props {
  course: Course
  attempts: Attempt[]
  enrollment: Enrollment
  currentUser: { id: string; role: string }
}

type QuizQuestion = {
  id: string
  text: string
  type: string
  points: number
  order: number
  options: { id: string; text: string; order: number; isCorrect?: boolean }[]
}

export default function CoursePlayerClient({ course: initialCourse, attempts: initialAttempts, enrollment: initialEnrollment, currentUser }: Props) {
  const [course, setCourse] = useState<Course>(initialCourse)
  const [attempts, setAttempts] = useState<Attempt[]>(initialAttempts)
  const [enrollment, setEnrollment] = useState<Enrollment>(initialEnrollment)
  const [activeLessonId, setActiveLessonId] = useState<string | null>(
    initialCourse.lessons[0]?.id ?? null
  )
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null)
  const [showAddLesson, setShowAddLesson] = useState(false)
  const [takingQuiz, setTakingQuiz] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastSentSecondsRef = useRef<number>(0)
  const lastSentAtRef = useRef<number>(0)

  const isManager = isManagerOrAbove(currentUser.role)

  const activeLesson = useMemo(
    () => course.lessons.find(l => l.id === activeLessonId) ?? null,
    [course.lessons, activeLessonId]
  )

  const completedSet = useMemo(() => {
    const set = new Set<string>()
    course.lessons.forEach(l => {
      if (l.progress[0]?.completed) set.add(l.id)
    })
    return set
  }, [course.lessons])

  const progressPct = course.lessons.length
    ? Math.round((completedSet.size / course.lessons.length) * 100)
    : 0

  const postProgress = useCallback(async (lessonId: string, payload: { completed: boolean; watchedSeconds: number }) => {
    await fetch(`/api/workryn/training/lessons/${lessonId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }, [])

  // Track watchedSeconds on video timeupdate, debounced to every ~7 seconds
  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeLesson) return

    lastSentSecondsRef.current = activeLesson.progress[0]?.watchedSeconds ?? 0
    lastSentAtRef.current = 0

    function onTime() {
      if (!video || !activeLesson) return
      const now = Date.now()
      const seconds = Math.floor(video.currentTime)
      if (now - lastSentAtRef.current > 7000 && Math.abs(seconds - lastSentSecondsRef.current) >= 3) {
        lastSentAtRef.current = now
        lastSentSecondsRef.current = seconds
        postProgress(activeLesson.id, {
          completed: Boolean(activeLesson.progress[0]?.completed),
          watchedSeconds: seconds,
        }).catch(() => {})
      }
    }

    function onEnded() {
      if (!activeLesson) return
      handleMarkComplete(activeLesson.id, Math.floor(video?.currentTime ?? 0))
    }

    video.addEventListener('timeupdate', onTime)
    video.addEventListener('ended', onEnded)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('ended', onEnded)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLesson?.id, postProgress])

  async function handleMarkComplete(lessonId: string, watchedSeconds: number) {
    await postProgress(lessonId, { completed: true, watchedSeconds })
    setCourse(c => ({
      ...c,
      lessons: c.lessons.map(l =>
        l.id === lessonId
          ? { ...l, progress: [{ id: l.progress[0]?.id ?? 'local', completed: true, watchedSeconds }] }
          : l
      ),
    }))
    if (!enrollment) {
      setEnrollment({ id: 'local', status: 'IN_PROGRESS', completedAt: null })
    }
  }

  async function handleEnroll() {
    const res = await fetch(`/api/workryn/training/courses/${course.id}/enroll`, {
      method: 'POST',
    })
    if (res.ok) {
      const data = await res.json()
      setEnrollment({ id: data.id, status: data.status, completedAt: data.completedAt })
    }
  }

  async function handleDeleteLesson(lessonId: string) {
    if (!confirm('Delete this lesson? This cannot be undone.')) return
    const res = await fetch(`/api/workryn/training/lessons/${lessonId}`, { method: 'DELETE' })
    if (res.ok) {
      setCourse(c => ({ ...c, lessons: c.lessons.filter(l => l.id !== lessonId) }))
      if (activeLessonId === lessonId) {
        setActiveLessonId(course.lessons.find(l => l.id !== lessonId)?.id ?? null)
      }
    }
  }

  async function handleDeleteQuiz(quizId: string) {
    if (!confirm('Delete this quiz? This cannot be undone.')) return
    const res = await fetch(`/api/workryn/training/quizzes/${quizId}`, { method: 'DELETE' })
    if (res.ok) {
      setCourse(c => ({ ...c, quizzes: c.quizzes.filter(q => q.id !== quizId) }))
    }
  }

  function onLessonSaved(lesson: Lesson, isNew: boolean) {
    setCourse(c => {
      if (isNew) return { ...c, lessons: [...c.lessons, { ...lesson, progress: [] }].sort((a, b) => a.order - b.order) }
      return {
        ...c,
        lessons: c.lessons.map(l => (l.id === lesson.id ? { ...l, ...lesson, progress: l.progress } : l)),
      }
    })
    if (isNew && !activeLessonId) setActiveLessonId(lesson.id)
  }

  function onQuizResult(quizId: string, attempt: Attempt) {
    setAttempts(a => [attempt, ...a])
    setTakingQuiz(null)
  }

  const lastAttemptByQuiz = useMemo(() => {
    const map = new Map<string, Attempt>()
    attempts.forEach(a => {
      if (!map.has(a.quizId)) map.set(a.quizId, a)
    })
    return map
  }, [attempts])

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
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              {course.category && (
                <span
                  style={{
                    fontSize: '0.6875rem',
                    color: 'var(--brand-light, #a5b4fc)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {course.category}
                </span>
              )}
              {course.isRequired && (
                <span
                  style={{
                    background: '#f59e0b33',
                    color: '#fbbf24',
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
                    background: 'rgba(100,116,139,0.25)',
                    color: 'var(--text-muted)',
                    padding: '3px 10px',
                    borderRadius: 99,
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                  }}
                >
                  DRAFT
                </span>
              )}
            </div>
            <h1 className="gradient-text" style={{ marginBottom: 4 }}>{course.title}</h1>
            {course.description && (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: 720 }}>
                {course.description}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {isManager && (
              <Link
                href={`/w/training/builder?courseId=${course.id}`}
                className="btn btn-ghost focus-ring"
                style={{ textDecoration: 'none' }}
              >
                <Settings size={16} /> Edit Course
              </Link>
            )}
            {!enrollment && !isManager && (
              <button className="btn btn-gradient focus-ring" onClick={handleEnroll}>
                Enroll
              </button>
            )}
            {enrollment?.status === 'COMPLETED' && (
              <span
                style={{
                  background: '#10b98133',
                  color: '#6ee7b7',
                  padding: '8px 14px',
                  borderRadius: 99,
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Award size={15} /> Completed
              </span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div
          className="glass-card"
          style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Progress
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', fontWeight: 700 }}>
              {completedSet.size} / {course.lessons.length} lessons ({progressPct}%)
            </span>
          </div>
          <div
            style={{
              height: 6,
              background: 'rgba(100,116,139,0.2)',
              borderRadius: 99,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: '100%',
                background: 'var(--brand-gradient)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      </div>

      <div className="page-body" style={{ paddingTop: 10 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(260px, 300px) 1fr',
            gap: 20,
            alignItems: 'start',
          }}
        >
          {/* Sidebar */}
          <aside
            className="glass-card"
            style={{
              padding: '16px 0',
              borderRadius: 'var(--radius-lg)',
              position: 'sticky',
              top: 20,
              maxHeight: 'calc(100vh - 40px)',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                padding: '0 16px 12px',
                borderBottom: '1px solid var(--border-subtle)',
                fontSize: '0.6875rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontWeight: 700,
              }}
            >
              Lessons
            </div>
            {course.lessons.length === 0 ? (
              <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                No lessons yet.
              </div>
            ) : (
              course.lessons.map((l, i) => {
                const isCompleted = completedSet.has(l.id)
                const isActive = l.id === activeLessonId
                return (
                  <div
                    key={l.id}
                    className={`lesson-item ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveLessonId(l.id)}
                  >
                    <span style={{ flexShrink: 0, color: isCompleted ? '#10b981' : 'var(--text-muted)' }}>
                      {isCompleted ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {i + 1}. {l.title}
                    </span>
                    {isManager && (
                      <>
                        <button
                          className="btn btn-icon btn-ghost focus-ring"
                          style={{ padding: 4, height: 'auto', minHeight: 0 }}
                          onClick={(e) => { e.stopPropagation(); setEditingLesson(l) }}
                          title="Edit lesson"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="btn btn-icon btn-ghost focus-ring"
                          style={{ padding: 4, height: 'auto', minHeight: 0 }}
                          onClick={(e) => { e.stopPropagation(); handleDeleteLesson(l.id) }}
                          title="Delete lesson"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                )
              })
            )}

            {isManager && (
              <div style={{ padding: '10px 16px' }}>
                <button
                  className="btn btn-ghost focus-ring"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => setShowAddLesson(true)}
                >
                  <Plus size={15} /> Add Lesson
                </button>
              </div>
            )}
          </aside>

          {/* Main content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            {activeLesson ? (
              <LessonView
                lesson={activeLesson}
                videoRef={videoRef}
                onMarkComplete={(s) => handleMarkComplete(activeLesson.id, s)}
                completed={completedSet.has(activeLesson.id)}
              />
            ) : (
              <div className="empty-state">
                <PlayCircle size={40} />
                <p>No lesson selected</p>
              </div>
            )}

            {/* Quizzes */}
            <div className="glass-card" style={{ padding: '18px 20px', borderRadius: 'var(--radius-lg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <HelpCircle size={18} /> Quizzes
                </h3>
                {isManager && (
                  <Link
                    href={`/w/training/builder?courseId=${course.id}`}
                    className="btn btn-ghost focus-ring"
                    style={{ textDecoration: 'none', padding: '6px 12px', fontSize: '0.8125rem' }}
                  >
                    <Plus size={14} /> Manage Quizzes
                  </Link>
                )}
              </div>
              {course.quizzes.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  No quizzes yet for this course.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {course.quizzes.map(q => {
                    const last = lastAttemptByQuiz.get(q.id)
                    return (
                      <div
                        key={q.id}
                        style={{
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          padding: '14px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>
                            {q.title}
                          </div>
                          {q.description && (
                            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{q.description}</div>
                          )}
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                            {q._count.questions} questions · Pass {q.passThreshold}%
                          </div>
                        </div>
                        {last && (
                          <span
                            style={{
                              padding: '4px 10px',
                              borderRadius: 99,
                              fontSize: '0.6875rem',
                              fontWeight: 700,
                              background: last.passed ? '#10b98133' : '#ef444433',
                              color: last.passed ? '#6ee7b7' : '#fca5a5',
                            }}
                          >
                            {last.passed ? 'Passed' : 'Failed'} · {last.score}%
                          </span>
                        )}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn btn-gradient focus-ring"
                            onClick={() => setTakingQuiz(q.id)}
                            disabled={q._count.questions === 0}
                          >
                            {last ? 'Retake' : 'Start Quiz'}
                          </button>
                          {isManager && (
                            <button
                              className="btn btn-icon btn-ghost focus-ring"
                              onClick={() => handleDeleteQuiz(q.id)}
                              title="Delete quiz"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {editingLesson && (
        <LessonEditorModal
          courseId={course.id}
          lesson={editingLesson}
          onClose={() => setEditingLesson(null)}
          onSaved={(l) => { onLessonSaved(l, false); setEditingLesson(null) }}
        />
      )}

      {showAddLesson && (
        <LessonEditorModal
          courseId={course.id}
          lesson={null}
          onClose={() => setShowAddLesson(false)}
          onSaved={(l) => { onLessonSaved(l, true); setShowAddLesson(false) }}
        />
      )}

      {takingQuiz && (
        <QuizRunner
          quizId={takingQuiz}
          onClose={() => setTakingQuiz(null)}
          onResult={(attempt) => onQuizResult(takingQuiz, attempt)}
        />
      )}

      <style>{`
        .lesson-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          cursor: pointer;
          font-size: 0.8125rem;
          color: var(--text-secondary);
          transition: background var(--transition-smooth);
          border-left: 3px solid transparent;
        }
        .lesson-item:hover {
          background: var(--glass-bg);
          color: var(--text-primary);
        }
        .lesson-item.active {
          background: rgba(99,102,241,0.1);
          color: var(--text-primary);
          border-left-color: var(--brand, #6366f1);
        }
      `}</style>
    </>
  )
}

function LessonView({
  lesson,
  videoRef,
  onMarkComplete,
  completed,
}: {
  lesson: Lesson
  videoRef: React.RefObject<HTMLVideoElement | null>
  onMarkComplete: (watched: number) => void
  completed: boolean
}) {
  return (
    <div className="glass-card" style={{ padding: '20px 24px', borderRadius: 'var(--radius-lg)' }}>
      <h2 style={{ margin: '0 0 12px', fontSize: '1.25rem' }}>{lesson.title}</h2>

      {lesson.videoUrl && (
        <div
          style={{
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            background: '#000',
            marginBottom: 16,
            border: '1px solid var(--border-subtle)',
          }}
        >
          <video
            ref={videoRef}
            key={lesson.id}
            src={lesson.videoUrl}
            controls
            style={{ width: '100%', display: 'block', maxHeight: 540 }}
          />
        </div>
      )}

      {lesson.content && (
        <div
          style={{
            fontSize: '0.9375rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.65,
            whiteSpace: 'pre-wrap',
          }}
        >
          {renderMarkdown(lesson.content)}
        </div>
      )}

      <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        {completed ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: '#6ee7b7',
              background: '#10b98133',
              padding: '8px 14px',
              borderRadius: 99,
              fontSize: '0.8125rem',
              fontWeight: 700,
            }}
          >
            <CheckCircle2 size={15} /> Completed
          </span>
        ) : (
          <button
            className="btn btn-gradient focus-ring"
            onClick={() => onMarkComplete(Math.floor(videoRef.current?.currentTime ?? 0))}
          >
            <CheckCircle2 size={15} /> Mark Complete
          </button>
        )}
      </div>
    </div>
  )
}

/** Simple markdown rendering: paragraphs, line breaks, bold, italic, code, headings */
function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split('\n')
  const nodes: React.ReactNode[] = []
  lines.forEach((line, i) => {
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      const Tag = (level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5') as keyof React.JSX.IntrinsicElements
      nodes.push(<Tag key={i} style={{ margin: '12px 0 6px', color: 'var(--text-primary)' }}>{inline(heading[2])}</Tag>)
      return
    }
    if (!line.trim()) {
      nodes.push(<div key={i} style={{ height: 8 }} />)
      return
    }
    nodes.push(<div key={i}>{inline(line)}</div>)
  })
  return <>{nodes}</>
}

function inline(text: string): React.ReactNode {
  // Very simple: **bold**, *italic*, `code`
  const parts: React.ReactNode[] = []
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let lastIdx = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index))
    const tok = match[0]
    if (tok.startsWith('**')) parts.push(<strong key={key++}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) parts.push(<code key={key++} style={{ background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace' }}>{tok.slice(1, -1)}</code>)
    else parts.push(<em key={key++}>{tok.slice(1, -1)}</em>)
    lastIdx = match.index + tok.length
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx))
  return <>{parts}</>
}

function LessonEditorModal({
  courseId,
  lesson,
  onClose,
  onSaved,
}: {
  courseId: string
  lesson: Lesson | null
  onClose: () => void
  onSaved: (lesson: Lesson) => void
}) {
  const [title, setTitle] = useState(lesson?.title ?? '')
  const [content, setContent] = useState(lesson?.content ?? '')
  const [videoUrl, setVideoUrl] = useState(lesson?.videoUrl ?? '')
  const [videoFileName, setVideoFileName] = useState(lesson?.videoFileName ?? '')
  const [order, setOrder] = useState<number>(lesson?.order ?? 0)
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
      <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div style={{ height: 3, background: 'var(--brand-gradient)', borderRadius: '24px 24px 0 0' }} />
        <div className="modal-header" style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3>{lesson ? 'Edit Lesson' : 'New Lesson'}</h3>
          <button className="btn btn-icon btn-ghost focus-ring" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="label">Title *</label>
            <input className="input focus-ring" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label className="label">Content (markdown)</label>
            <textarea
              className="input focus-ring"
              style={{ minHeight: 200, resize: 'vertical', fontFamily: 'inherit' }}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Write the lesson content here..."
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
                  accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.webm,.mov,.avi,.mkv,.m4v"
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

function QuizRunner({
  quizId,
  onClose,
  onResult,
}: {
  quizId: string
  onClose: () => void
  onResult: (attempt: Attempt) => void
}) {
  const [loading, setLoading] = useState(true)
  const [quiz, setQuiz] = useState<{ id: string; title: string; description: string | null; passThreshold: number; questions: QuizQuestion[] } | null>(null)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ score: number; passed: boolean; passThreshold: number; earned: number; total: number } | null>(null)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/workryn/training/quizzes/${quizId}`)
        if (res.ok) setQuiz(await res.json())
      } finally {
        setLoading(false)
      }
    })()
  }, [quizId])

  function setSingle(qid: string, oid: string) {
    setAnswers(a => ({ ...a, [qid]: oid }))
  }
  function toggleMulti(qid: string, oid: string) {
    setAnswers(a => {
      const prev = Array.isArray(a[qid]) ? a[qid] as string[] : []
      if (prev.includes(oid)) return { ...a, [qid]: prev.filter(x => x !== oid) }
      return { ...a, [qid]: [...prev, oid] }
    })
  }

  async function submit() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/workryn/training/quizzes/${quizId}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      if (!res.ok) {
        alert('Failed to submit quiz')
        return
      }
      const data = await res.json()
      setResult({
        score: data.score,
        passed: data.passed,
        passThreshold: data.passThreshold,
        earned: data.earned,
        total: data.total,
      })
      onResult({
        id: data.id,
        quizId,
        score: data.score,
        passed: data.passed,
        startedAt: new Date().toISOString(),
        completedAt: data.completedAt,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 3, background: 'var(--brand-gradient)', borderRadius: '24px 24px 0 0' }} />
        <div className="modal-header" style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3>{quiz?.title ?? 'Quiz'}</h3>
          <button className="btn btn-icon btn-ghost focus-ring" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ padding: '20px 24px', overflowY: 'auto' }}>
          {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="spin" size={22} /></div>}

          {!loading && result && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div
                style={{
                  width: 90,
                  height: 90,
                  borderRadius: '50%',
                  background: result.passed ? '#10b98133' : '#ef444433',
                  color: result.passed ? '#6ee7b7' : '#fca5a5',
                  margin: '0 auto 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {result.passed ? <Award size={42} /> : <X size={42} />}
              </div>
              <h2 style={{ margin: 0, marginBottom: 6 }}>
                {result.passed ? 'Passed!' : 'Not Passed'}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem', marginBottom: 4 }}>
                You scored {result.score}% ({result.earned}/{result.total} points)
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                Pass threshold: {result.passThreshold}%
              </p>
            </div>
          )}

          {!loading && !result && quiz && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {quiz.description && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{quiz.description}</p>
              )}
              {quiz.questions.length === 0 && (
                <div style={{ color: 'var(--text-muted)' }}>No questions yet.</div>
              )}
              {quiz.questions.map((q, i) => (
                <div key={q.id} style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 16 }}>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: 10 }}>
                    {i + 1}. {q.text}
                    {q.type === 'MULTIPLE_CHOICE_MULTI' && (
                      <span style={{ marginLeft: 8, fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                        (select all that apply)
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {q.options.map(opt => {
                      const isMulti = q.type === 'MULTIPLE_CHOICE_MULTI'
                      const selectedSingle = answers[q.id] === opt.id
                      const selectedMulti = Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt.id)
                      const isSelected = isMulti ? selectedMulti : selectedSingle
                      return (
                        <label
                          key={opt.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '10px 14px',
                            border: `1px solid ${isSelected ? 'var(--brand, #6366f1)' : 'var(--border-subtle)'}`,
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            background: isSelected ? 'rgba(99,102,241,0.12)' : 'transparent',
                            transition: 'all var(--transition-smooth)',
                          }}
                        >
                          <input
                            type={isMulti ? 'checkbox' : 'radio'}
                            name={`q-${q.id}`}
                            checked={isSelected}
                            onChange={() => isMulti ? toggleMulti(q.id, opt.id) : setSingle(q.id, opt.id)}
                          />
                          <span>{opt.text}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--border-subtle)' }}>
          {result ? (
            <button className="btn btn-gradient focus-ring" onClick={onClose}>Close</button>
          ) : (
            <>
              <button className="btn btn-ghost focus-ring" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-gradient focus-ring"
                onClick={submit}
                disabled={submitting || loading || !quiz || quiz.questions.length === 0}
              >
                {submitting ? <Loader2 size={16} className="spin" /> : 'Submit Quiz'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

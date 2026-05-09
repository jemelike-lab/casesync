'use client'
import { useMemo, useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BookOpen, Plus, Search, Clock, CheckCircle2, Star, Loader2, X,
  PlayCircle, HelpCircle, Users, ChevronRight, Sparkles, Award, TrendingUp,
  BarChart3, GraduationCap, Video, FileText, Zap, Target, Play, Pause,
  Volume2, VolumeX, Maximize, SkipForward, Trophy, Brain, Shield, Heart,
  ArrowRight, Eye, Lock, Flame, BookMarked, Monitor, Bell,
} from 'lucide-react'
import { isManagerOrAbove } from '@/lib/workryn/permissions'
import { getInitials } from '@/lib/workryn/utils'

type Course = {
  id: string; title: string; description: string | null; thumbnail: string | null
  category: string | null; isRequired: boolean; isPublished: boolean; passThreshold: number
  createdAt: string; createdBy: { id: string; name: string | null; avatarColor: string }
  _count: { lessons: number; quizzes: number; enrollments: number }
}
type Enrollment = { id: string; courseId: string; status: string; enrolledAt: string; completedAt: string | null }
type StaffUser = { id: string; name: string | null; email: string | null; avatarColor: string; departmentId: string | null; jobTitle: string | null }
type Dept = { id: string; name: string; color: string; _count: { users: number } }
type ReportEntry = {
  enrollmentId: string; status: string; enrolledAt: string; completedAt: string | null
  user: { id: string; name: string | null; email: string | null; avatarColor: string; role: string; jobTitle: string | null; department: { name: string } | null }
  lessonsCompleted: number; totalLessons: number
}
interface Props {
  initialCourses: Course[]; initialEnrollments: Enrollment[]; currentUser: { id: string; role: string }
  users?: StaffUser[]; departments?: Dept[]
}
type FilterTab = 'ALL' | 'MINE' | 'REQUIRED' | 'COMPLETED'

// ═══════════════════════════════════════════
// TRAINING CENTER CONFIG — easy to update
// ═══════════════════════════════════════════
const WELCOME_CONFIG = {
  // YouTube video ID (the part after v= in the URL). Set to null to hide.
  youtubeVideoId: 'yIeolU5ew28' as string | null,
  // Banner image URL. Set to null for gradient-only banner.
  bannerImage: '/images/training-banner.jpg' as string | null,
  // Banner text — not shown when bannerImage contains its own text
  bannerTitle: 'Welcome to BLH Training',
  bannerSubtitle: 'Your hub for professional development, compliance training, and team growth.',
}

function useCountUp(target: number, duration = 1000, delay = 200): number {
  const [val, setVal] = useState(target)
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current) return; mounted.current = true
    if (target === 0) { setVal(0); return }
    setVal(0)
    const timeout = setTimeout(() => {
      const start = performance.now()
      const step = (now: number) => {
        const elapsed = now - start
        const progress = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setVal(Math.round(eased * target))
        if (progress < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }, delay)
    return () => clearTimeout(timeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return val
}

function ProgressRing({ progress, size = 80, stroke = 6, color = '#3b82f6' }: {
  progress: number; size?: number; stroke?: number; color?: string
}) {
  const r = (size - stroke) / 2; const circ = 2 * Math.PI * r; const offset = circ - (progress / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)' }} />
    </svg>
  )
}

/* ═══════════════════════════════════════════
   WELCOME BANNER — full-width hero image
   ═══════════════════════════════════════════ */

function WelcomeBanner({ config }: { config: typeof WELCOME_CONFIG }) {
  const hasImage = Boolean(config.bannerImage)
  return (
    <div className="tr-welcome-banner animate-slide-up">
      <div className="tr-banner-bg">
        {hasImage ? (
          <img src={config.bannerImage!} alt="Training Center Banner" className="tr-banner-img" />
        ) : (
          <>
            <div className="tr-banner-gradient-bg" />
            <div className="tr-banner-overlay" />
          </>
        )}
      </div>
      {/* Only show text overlay when there's no custom banner image */}
      {!hasImage && (
        <div className="tr-banner-content">
          <div className="tr-banner-icon-ring">
            <GraduationCap size={32} />
          </div>
          <h2 className="tr-banner-title">{config.bannerTitle}</h2>
          <p className="tr-banner-subtitle">{config.bannerSubtitle}</p>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════
   YOUTUBE WELCOME VIDEO — autoplay muted
   ═══════════════════════════════════════════ */

function YouTubeWelcome({ videoId }: { videoId: string }) {
  return (
    <div className="tr-youtube-section animate-slide-up" style={{ animationDelay: '150ms' }}>
      <div className="tr-section-header" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.15)', color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Video size={18} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.0625rem' }}>Welcome Video</h3>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Watch our introduction to get started</p>
          </div>
        </div>
      </div>
      <div className="tr-youtube-wrapper">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`}
          title="Welcome to BLH Training"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="tr-youtube-iframe"
        />
      </div>
    </div>
  )
}

function Particles() {
  const particles = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    id: i, left: `${Math.random()*100}%`, top: `${Math.random()*100}%`,
    size: 2 + Math.random()*3, dur: 12 + Math.random()*20, delay: Math.random()*8, opacity: 0.15 + Math.random()*0.25,
  })), [])
  return (
    <div className="tr-particles">
      {particles.map(p => <div key={p.id} className="tr-particle" style={{
        left: p.left, top: p.top, width: p.size, height: p.size,
        animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`, opacity: p.opacity,
      }} />)}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, accent, delay = 0, total }: {
  icon: typeof Award; label: string; value: number; accent: string; delay?: number; total?: number
}) {
  const displayVal = useCountUp(value, 1000, 200 + delay)
  const pct = total && total > 0 ? Math.round((value / total) * 100) : null
  return (
    <div className="tr-stat-card animate-slide-up" style={{ animationDelay: `${delay}ms` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div className="tr-stat-icon" style={{ background: `${accent}18`, color: accent, boxShadow: `0 0 20px ${accent}15` }}>
          <Icon size={24} />
        </div>
        {pct !== null && (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ProgressRing progress={pct} size={48} stroke={4} color={accent} />
            <span style={{ position: 'absolute', fontSize: '0.6875rem', fontWeight: 800, color: accent }}>{pct}%</span>
          </div>
        )}
      </div>
      <div>
        <div className="tr-stat-value">{displayVal}</div>
        <div className="tr-stat-label">{label}</div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   FEATURED HERO — cinematic course banner
   ═══════════════════════════════════════════ */

function FeaturedHero({ courses, enrollments }: { courses: Course[]; enrollments: Map<string, Enrollment> }) {
  const featured = useMemo(() => {
    const req = courses.find(c => c.isRequired && c.isPublished && enrollments.get(c.id)?.status !== 'COMPLETED')
    return req || courses.find(c => c.isPublished) || courses[0]
  }, [courses, enrollments])
  if (!featured) return null
  const enrollment = enrollments.get(featured.id)
  const isCompleted = enrollment?.status === 'COMPLETED'
  const isInProgress = enrollment?.status === 'IN_PROGRESS'

  return (
    <Link href={`/w/training/courses/${featured.id}`} style={{ textDecoration: 'none' }}>
      <div className="tr-hero animate-slide-up">
        <div className="tr-hero-bg">
          {featured.thumbnail
            ? <img src={featured.thumbnail} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
            : <div className="tr-hero-gradient" />}
          <div className="tr-hero-overlay" />
        </div>
        <div className="tr-hero-content">
          <div className="tr-hero-left">
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
              {featured.isRequired && <span className="tr-hero-badge tr-badge-required"><Star size={12}/> Required</span>}
              {isCompleted && <span className="tr-hero-badge tr-badge-completed"><CheckCircle2 size={12}/> Completed</span>}
              {isInProgress && <span className="tr-hero-badge tr-badge-progress"><Clock size={12}/> In Progress</span>}
            </div>
            {featured.category && <div className="tr-hero-category">{featured.category}</div>}
            <h2 className="tr-hero-title">{featured.title}</h2>
            {featured.description && <p className="tr-hero-desc">{featured.description}</p>}
            <div className="tr-hero-meta">
              <span><PlayCircle size={14}/> {featured._count.lessons} Lessons</span>
              <span><HelpCircle size={14}/> {featured._count.quizzes} Quizzes</span>
              <span><Users size={14}/> {featured._count.enrollments} Enrolled</span>
            </div>
            <div className="tr-hero-cta">
              <span className="tr-hero-play-icon"><Play size={16} fill="#fff"/></span>
              <span>{isInProgress ? 'Continue Learning' : isCompleted ? 'Review Course' : 'Start Course'}</span>
              <ArrowRight size={16}/>
            </div>
          </div>
          <div className="tr-hero-right">
            <div className="tr-hero-play-ring"><Play size={40} fill="rgba(255,255,255,0.9)"/></div>
          </div>
        </div>
      </div>
    </Link>
  )
}

/* ═══════════════════════════════════════════
   INTERACTIVE QUIZ WIDGET
   ═══════════════════════════════════════════ */

function QuizPreviewWidget() {
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const correctAnswer = 2
  const q = {
    question: "Under HIPAA, a Covered Entity must report a breach of unsecured PHI to affected individuals within:",
    options: ["30 days of discovery", "45 days of discovery", "60 days of discovery", "90 days of discovery"],
  }

  return (
    <div className="tr-quiz-widget animate-slide-up" style={{ animationDelay:'300ms' }}>
      <div className="tr-quiz-header">
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div className="tr-quiz-icon"><Brain size={22}/></div>
          <div>
            <div className="tr-quiz-label">Sample Quiz</div>
            <div className="tr-quiz-sublabel">HIPAA Compliance</div>
          </div>
        </div>
        <span className="tr-quiz-badge-num">1 / 10</span>
      </div>
      <div className="tr-quiz-question">{q.question}</div>
      <div className="tr-quiz-options">
        {q.options.map((opt, i) => {
          let cls = 'tr-quiz-option'
          if (selectedAnswer === i && !revealed) cls += ' selected'
          if (revealed && i === correctAnswer) cls += ' correct'
          if (revealed && selectedAnswer === i && i !== correctAnswer) cls += ' wrong'
          return (
            <button key={i} className={cls} onClick={() => !revealed && setSelectedAnswer(i)} type="button">
              <span className="tr-quiz-letter">{String.fromCharCode(65+i)}</span>
              <span className="tr-quiz-text">{opt}</span>
              {revealed && i === correctAnswer && <CheckCircle2 size={16} className="tr-quiz-check"/>}
            </button>
          )
        })}
      </div>
      <div className="tr-quiz-actions">
        {!revealed ? (
          <button className="btn btn-gradient focus-ring" style={{ width:'100%' }}
            onClick={() => selectedAnswer !== null && setRevealed(true)}
            disabled={selectedAnswer === null} type="button">
            <Zap size={16}/> Check Answer
          </button>
        ) : (
          <div style={{ display:'flex', alignItems:'center', gap:12, width:'100%' }}>
            <div className={`tr-quiz-result ${selectedAnswer === correctAnswer ? 'correct' : 'wrong'}`}>
              {selectedAnswer === correctAnswer
                ? <><Trophy size={18}/> Correct!</>
                : <><X size={18}/> Answer is C</>}
            </div>
            <button className="btn btn-ghost focus-ring" onClick={() => { setSelectedAnswer(null); setRevealed(false) }}
              type="button" style={{ marginLeft:'auto' }}>Try Again</button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   VIDEO PLAYER PREVIEW
   ═══════════════════════════════════════════ */

function VideoPlayerPreview() {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [muted, setMuted] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setProgress(p => { if (p >= 100) { setPlaying(false); return 100 }; return p + 0.5 })
      }, 100)
    } else { if (intervalRef.current) clearInterval(intervalRef.current) }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing])

  return (
    <div className="tr-video-preview animate-slide-up" style={{ animationDelay:'200ms' }}>
      <div className="tr-video-screen" onClick={() => setPlaying(!playing)}>
        <div className="tr-video-bg-pattern"/>
        <div className="tr-video-center-play">
          {playing ? (
            <div className="tr-video-wave">
              {[1,2,3,4,5].map(i => <div key={i} className="tr-wave-bar" style={{ animationDelay:`${i*0.1}s` }}/>)}
            </div>
          ) : (
            <div className="tr-video-play-btn"><Play size={32} fill="#fff"/></div>
          )}
        </div>
        <div className="tr-video-lesson-label"><Monitor size={14}/> Lesson 1: Understanding Protected Health Information</div>
      </div>
      <div className="tr-video-controls">
        <button className="tr-vid-ctrl" onClick={() => setPlaying(!playing)} type="button">
          {playing ? <Pause size={16}/> : <Play size={16} fill="currentColor"/>}
        </button>
        <div className="tr-vid-bar">
          <div className="tr-vid-fill" style={{ width:`${progress}%` }}/>
          <div className="tr-vid-thumb" style={{ left:`${progress}%` }}/>
        </div>
        <span className="tr-vid-time">{Math.floor(progress*0.12)}:{String(Math.floor((progress*7.2)%60)).padStart(2,'0')} / 12:00</span>
        <button className="tr-vid-ctrl" onClick={() => setMuted(!muted)} type="button">
          {muted ? <VolumeX size={14}/> : <Volume2 size={14}/>}
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   LEARNING PATH TIMELINE
   ═══════════════════════════════════════════ */

function LearningPath({ courses, enrollments }: { courses: Course[]; enrollments: Map<string, Enrollment> }) {
  const required = courses.filter(c => c.isRequired && c.isPublished)
  if (required.length === 0) return null
  const completedCount = required.filter(c => enrollments.get(c.id)?.status === 'COMPLETED').length

  return (
    <div className="tr-learning-path animate-slide-up" style={{ animationDelay:'400ms' }}>
      <div className="tr-section-header">
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <Target size={20} color="var(--brand-light)"/>
          <h3 style={{ margin:0 }}>Your Learning Path</h3>
        </div>
        <div className="tr-path-progress-wrap">
          <div className="tr-path-progress-bar">
            <div className="tr-path-progress-fill" style={{ width: `${required.length > 0 ? (completedCount/required.length)*100 : 0}%` }}/>
          </div>
          <span className="tr-path-progress-text">{completedCount}/{required.length}</span>
        </div>
      </div>
      <div className="tr-path-track">
        {required.map((c, i) => {
          const enrollment = enrollments.get(c.id)
          const done = enrollment?.status === 'COMPLETED'
          const active = enrollment?.status === 'IN_PROGRESS'
          return (
            <Link key={c.id} href={`/w/training/courses/${c.id}`} style={{ textDecoration:'none' }}>
              <div className={`tr-path-node ${done ? 'completed' : active ? 'active' : ''}`}>
                <div className="tr-path-dot">{done ? <CheckCircle2 size={18}/> : <span>{i+1}</span>}</div>
                <div className="tr-path-info">
                  <div className="tr-path-title">{c.title}</div>
                  <div className="tr-path-meta">
                    <span><PlayCircle size={12}/> {c._count.lessons}</span>
                    <span><HelpCircle size={12}/> {c._count.quizzes}</span>
                  </div>
                </div>
                <ChevronRight size={16} style={{ color:'var(--text-muted)', flexShrink:0 }}/>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   COURSE CARD — rich thumbnail + progress
   ═══════════════════════════════════════════ */

function CourseCard({ course, enrollment, index, isManager, onAssign, onTrack }: {
  course: Course; enrollment: Enrollment | undefined; index: number
  isManager?: boolean; onAssign?: () => void; onTrack?: () => void
}) {
  const isCompleted = enrollment?.status === 'COMPLETED'
  const isInProgress = enrollment?.status === 'IN_PROGRESS'
  return (
    <div className={`tr-course-card animate-slide-up`} style={{ animationDelay:`${index*60}ms` }}>
      <Link href={`/w/training/courses/${course.id}`} style={{ textDecoration:'none', display:'contents' }}>
        <div className="tr-course-thumb">
          {course.thumbnail
            ? <img src={course.thumbnail} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }}/>
            : <div className="tr-course-thumb-fallback"><BookOpen size={36}/></div>}
          <div className="tr-course-thumb-overlay"><div className="tr-course-play-hover"><Play size={24} fill="#fff"/></div></div>
          {course.isRequired && <span className="tr-course-badge tr-cbr"><Star size={10}/> Required</span>}
          {!course.isPublished && <span className="tr-course-badge tr-cbd"><Lock size={10}/> Draft</span>}
          {isCompleted && <span className="tr-course-badge tr-cbc"><CheckCircle2 size={10}/> Done</span>}
        </div>
        <div className="tr-course-body">
          {course.category && <div className="tr-course-category">{course.category}</div>}
          <h4 className="tr-course-title">{course.title}</h4>
          {course.description && <p className="tr-course-desc">{course.description}</p>}
          {isInProgress && (
            <div className="tr-course-progress">
              <div className="tr-cpb"><div className="tr-cpf" style={{ width:'45%' }}/></div>
              <span className="tr-cpt">In Progress</span>
            </div>
          )}
          <div className="tr-course-footer">
            <span><PlayCircle size={13}/> {course._count.lessons}</span>
            <span><HelpCircle size={13}/> {course._count.quizzes}</span>
            <span><Users size={13}/> {course._count.enrollments}</span>
            <span className="tr-course-arrow"><ArrowRight size={14}/></span>
          </div>
        </div>
      </Link>
      {isManager && (
        <div className="tr-course-admin-bar">
          <button className="btn btn-ghost btn-sm focus-ring" onClick={e => { e.preventDefault(); onAssign?.() }} type="button">
            <Users size={13}/> Assign
          </button>
          <button className="btn btn-ghost btn-sm focus-ring" onClick={e => { e.preventDefault(); onTrack?.() }} type="button">
            <BarChart3 size={13}/> Track
          </button>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */

/* ═══════════════════════════════════════════
   ASSIGN TRAINING MODAL
   ═══════════════════════════════════════════ */

function AssignModal({ course, users, departments, onClose, onAssigned }: {
  course: Course; users: StaffUser[]; departments: Dept[]; onClose: () => void; onAssigned: () => void
}) {
  const [mode, setMode] = useState<'users'|'departments'>('users')
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [selectedDepts, setSelectedDepts] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ assigned: number; alreadyEnrolled: number } | null>(null)

  const filteredUsers = useMemo(() => {
    if (!search) return users
    const q = search.toLowerCase()
    return users.filter(u => (u.name ?? '').toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q))
  }, [users, search])

  function toggleUser(id: string) {
    setSelectedUsers(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleDept(id: string) {
    setSelectedDepts(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function selectAll() {
    setSelectedUsers(new Set(filteredUsers.map(u => u.id)))
  }

  async function handleAssign() {
    const payload: { userIds?: string[]; departmentIds?: string[] } = {}
    if (mode === 'users' && selectedUsers.size > 0) payload.userIds = [...selectedUsers]
    if (mode === 'departments' && selectedDepts.size > 0) payload.departmentIds = [...selectedDepts]
    if (!payload.userIds?.length && !payload.departmentIds?.length) return

    setSaving(true)
    try {
      const res = await fetch(`/api/workryn/training/courses/${course.id}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!res.ok) { const err = await res.json().catch(() => ({})); alert(err.error || 'Failed'); return }
      const data = await res.json()
      setResult(data)
      onAssigned()
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div style={{ height: 3, background: 'var(--brand-gradient)', borderRadius: '24px 24px 0 0' }} />
        <div className="modal-header" style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Users size={18} color="var(--brand-light)" /> Assign Training</h3>
          <button className="btn btn-icon btn-ghost focus-ring" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Assigning to</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>{course.title}</div>
          </div>

          {result ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <CheckCircle2 size={40} color="#10b981" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                {result.assigned} user{result.assigned !== 1 ? 's' : ''} assigned
              </div>
              {result.alreadyEnrolled > 0 && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  {result.alreadyEnrolled} already enrolled (skipped)
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Mode toggle */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button className={`tr-tab focus-ring ${mode === 'users' ? 'active' : ''}`} onClick={() => setMode('users')} type="button" style={{ flex: 1 }}>
                  <Users size={14} /> Individual Users
                </button>
                <button className={`tr-tab focus-ring ${mode === 'departments' ? 'active' : ''}`} onClick={() => setMode('departments')} type="button" style={{ flex: 1 }}>
                  <Target size={14} /> By Department
                </button>
              </div>

              {mode === 'users' ? (
                <>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div className="tr-search-wrap" style={{ flex: 1 }}>
                      <Search size={14} className="tr-search-icon" />
                      <input className="tr-search-input focus-ring" placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)} style={{ height: 38 }} />
                    </div>
                    <button className="btn btn-ghost btn-sm focus-ring" onClick={selectAll} type="button">Select all</button>
                  </div>
                  <div className="tr-assign-list">
                    {filteredUsers.map(u => (
                      <label key={u.id} className={`tr-assign-item ${selectedUsers.has(u.id) ? 'selected' : ''}`}>
                        <input type="checkbox" checked={selectedUsers.has(u.id)} onChange={() => toggleUser(u.id)} />
                        <div className="avatar" style={{ width: 32, height: 32, background: u.avatarColor, fontSize: '0.6875rem' }}>
                          {getInitials(u.name || '?')}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{u.name || 'Unnamed'}</div>
                          {u.jobTitle && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.jobTitle}</div>}
                        </div>
                      </label>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedUsers.size} selected</div>
                </>
              ) : (
                <div className="tr-assign-list">
                  {departments.map(d => (
                    <label key={d.id} className={`tr-assign-item ${selectedDepts.has(d.id) ? 'selected' : ''}`}>
                      <input type="checkbox" checked={selectedDepts.has(d.id)} onChange={() => toggleDept(d.id)} />
                      <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: `${d.color}22`, color: d.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Users size={16} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{d.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d._count.users} member{d._count.users !== 1 ? 's' : ''}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-footer" style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--border-subtle)' }}>
          <button className="btn btn-ghost focus-ring" onClick={onClose} type="button">{result ? 'Close' : 'Cancel'}</button>
          {!result && (
            <button className="btn btn-gradient focus-ring" onClick={handleAssign}
              disabled={saving || (mode === 'users' ? selectedUsers.size === 0 : selectedDepts.size === 0)} type="button">
              {saving ? <Loader2 size={16} className="spin" /> : <Zap size={16} />}
              Assign {mode === 'users' ? `${selectedUsers.size} User${selectedUsers.size !== 1 ? 's' : ''}` : `${selectedDepts.size} Dept${selectedDepts.size !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   COMPLETION TRACKER MODAL
   ═══════════════════════════════════════════ */

function CompletionTracker({ course, onClose }: { course: Course; onClose: () => void }) {
  const [report, setReport] = useState<{ course: { totalLessons: number }; enrollments: ReportEntry[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [reminding, setReminding] = useState(false)
  const [reminded, setReminded] = useState(false)

  useEffect(() => {
    fetch(`/api/workryn/training/courses/${course.id}/report`)
      .then(r => r.json())
      .then(data => { setReport(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [course.id])

  async function handleRemindAll() {
    setReminding(true)
    try {
      await fetch(`/api/workryn/training/courses/${course.id}/remind`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      setReminded(true)
      setTimeout(() => setReminded(false), 3000)
    } finally { setReminding(false) }
  }

  async function handleRemindOne(userId: string) {
    await fetch(`/api/workryn/training/courses/${course.id}/remind`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: [userId] }),
    })
  }

  const completed = report?.enrollments.filter(e => e.status === 'COMPLETED').length ?? 0
  const total = report?.enrollments.length ?? 0
  const incomplete = total - completed

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div style={{ height: 3, background: 'var(--brand-gradient)', borderRadius: '24px 24px 0 0' }} />
        <div className="modal-header" style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BarChart3 size={18} color="var(--brand-light)" /> Completion Tracker</h3>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{course.title}</div>
          </div>
          <button className="btn btn-icon btn-ghost focus-ring" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}><Loader2 size={24} className="spin" /></div>
          ) : !report || total === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>No enrollments yet</div>
          ) : (
            <>
              {/* Summary stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div className="tr-tracker-stat">
                  <div className="tr-tracker-stat-val">{total}</div>
                  <div className="tr-tracker-stat-label">Enrolled</div>
                </div>
                <div className="tr-tracker-stat">
                  <div className="tr-tracker-stat-val" style={{ color: '#10b981' }}>{completed}</div>
                  <div className="tr-tracker-stat-label">Completed</div>
                </div>
                <div className="tr-tracker-stat">
                  <div className="tr-tracker-stat-val" style={{ color: incomplete > 0 ? '#f59e0b' : 'var(--text-muted)' }}>{incomplete}</div>
                  <div className="tr-tracker-stat-label">Incomplete</div>
                </div>
              </div>

              {/* Completion bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div style={{ width: `${total > 0 ? (completed/total)*100 : 0}%`, height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, #10b981, #34d399)', transition: 'width 800ms ease' }} />
                </div>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#10b981' }}>{total > 0 ? Math.round((completed/total)*100) : 0}%</span>
              </div>

              {/* Remind all button */}
              {incomplete > 0 && (
                <button className="btn btn-ghost focus-ring" onClick={handleRemindAll} disabled={reminding || reminded} type="button" style={{ alignSelf: 'flex-start' }}>
                  {reminded ? <><CheckCircle2 size={14} /> Reminders Sent</> : reminding ? <><Loader2 size={14} className="spin" /> Sending...</> : <><Bell size={14} /> Remind All Incomplete ({incomplete})</>}
                </button>
              )}

              {/* User list */}
              <div className="tr-tracker-list">
                {report.enrollments.map(e => {
                  const pct = e.totalLessons > 0 ? Math.round((e.lessonsCompleted / e.totalLessons) * 100) : 0
                  const isDone = e.status === 'COMPLETED'
                  return (
                    <div key={e.enrollmentId} className={`tr-tracker-row ${isDone ? 'done' : ''}`}>
                      <div className="avatar" style={{ width: 34, height: 34, background: e.user.avatarColor, fontSize: '0.6875rem', flexShrink: 0 }}>
                        {getInitials(e.user.name || '?')}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{e.user.name || e.user.email}</span>
                          {isDone && <CheckCircle2 size={14} color="#10b981" />}
                        </div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {e.user.department?.name ?? 'No dept'} · {e.lessonsCompleted}/{e.totalLessons} lessons · Enrolled {new Date(e.enrolledAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <div style={{ width: 60 }}>
                          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: isDone ? '#10b981' : '#3b82f6' }} />
                          </div>
                        </div>
                        <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: isDone ? '#10b981' : 'var(--text-muted)', minWidth: 32 }}>{pct}%</span>
                        {!isDone && (
                          <button className="btn btn-icon btn-ghost btn-sm focus-ring" onClick={() => handleRemindOne(e.user.id)} title="Send reminder" type="button">
                            <Bell size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
        <div className="modal-footer" style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--border-subtle)' }}>
          <button className="btn btn-ghost focus-ring" onClick={onClose} type="button">Close</button>
        </div>
      </div>
    </div>
  )
}

export default function TrainingClient({ initialCourses, initialEnrollments, currentUser, users = [], departments = [] }: Props) {
  const router = useRouter()
  const [courses, setCourses] = useState<Course[]>(initialCourses)
  const [enrollments] = useState<Enrollment[]>(initialEnrollments)
  const [channel, setChannel] = useState<'ALL'|'NEW_HIRE'|'REFRESHER'>('ALL')
  const [tab, setTab] = useState<FilterTab>('ALL')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [assignCourse, setAssignCourse] = useState<Course | null>(null)
  const [trackerCourse, setTrackerCourse] = useState<Course | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title:'', description:'', category:'', isRequired:false, passThreshold:70, isPublished:false,
    channel: null as string | null, scoresVisibility: 'ALL',
  })
  const canCreate = isManagerOrAbove(currentUser.role)

  const enrollmentByCourse = useMemo(() => {
    const map = new Map<string, Enrollment>()
    enrollments.forEach(e => map.set(e.courseId, e))
    return map
  }, [enrollments])

  // Channel-filtered courses
  const channelCourses = useMemo(() => {
    if (channel === 'ALL') return courses
    return courses.filter(c => (c as any).channel === channel)
  }, [courses, channel])

  const stats = useMemo(() => {
    const src = channelCourses
    const total = src.filter(c => c.isPublished).length
    const required = src.filter(c => c.isRequired).length
    const enrolled = enrollments.filter(e => channelCourses.some(c => c.id === e.courseId))
    const inProgress = enrolled.filter(e => e.status === 'IN_PROGRESS').length
    const completed = enrolled.filter(e => e.status === 'COMPLETED').length
    return { total, required, inProgress, completed }
  }, [channelCourses, enrollments])

  const filtered = useMemo(() => {
    return channelCourses.filter(c => {
      if (search) {
        const q = search.toLowerCase()
        if (!c.title.toLowerCase().includes(q) && !(c.description??'').toLowerCase().includes(q) && !(c.category??'').toLowerCase().includes(q)) return false
      }
      const enrollment = enrollmentByCourse.get(c.id)
      switch (tab) {
        case 'MINE': return Boolean(enrollment)
        case 'REQUIRED': return c.isRequired
        case 'COMPLETED': return enrollment?.status === 'COMPLETED'
        default: return true
      }
    })
  }, [channelCourses, tab, search, enrollmentByCourse])

  async function handleCreate() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const payload = {
        ...form,
        channel: form.channel || null,
        scoresVisibility: form.scoresVisibility,
      }
      const res = await fetch('/api/workryn/training/courses', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload),
      })
      if (!res.ok) { const err = await res.json().catch(() => ({})); alert(err.error || 'Failed'); return }
      const created = await res.json()
      setCourses(prev => [created, ...prev])
      setShowCreate(false)
      setForm({ title:'', description:'', category:'', isRequired:false, passThreshold:70, isPublished:false, channel:null, scoresVisibility:'ALL' })
      router.push(`/w/training/builder?courseId=${created.id}`)
    } finally { setSaving(false) }
  }

  // Channel counts
  const newHireCount = courses.filter(c => (c as any).channel === 'NEW_HIRE').length
  const refresherCount = courses.filter(c => (c as any).channel === 'REFRESHER').length

  const tabConfig: { id: FilterTab; label: string; icon: typeof BookOpen; count: number }[] = [
    { id:'ALL', label:'All Courses', icon:BookOpen, count:channelCourses.length },
    { id:'MINE', label:'My Courses', icon:BookMarked, count:enrollments.filter(e => channelCourses.some(c => c.id === e.courseId)).length },
    { id:'REQUIRED', label:'Required', icon:Shield, count:stats.required },
    { id:'COMPLETED', label:'Completed', icon:Trophy, count:stats.completed },
  ]

  return (
    <>
      <div className="tr-page" style={{ position:'relative' }}>
        <Particles/>

        {/* Welcome Banner */}
        <WelcomeBanner config={WELCOME_CONFIG} />

        {/* YouTube Welcome Video */}
        {WELCOME_CONFIG.youtubeVideoId && (
          <div style={{ padding: '0 32px 28px', position: 'relative', zIndex: 1 }}>
            <YouTubeWelcome videoId={WELCOME_CONFIG.youtubeVideoId} />
          </div>
        )}

        {/* Header */}
        <div className="tr-header">
          <div className="tr-header-top">
            <div />
            {canCreate && (
              <button className="btn btn-gradient focus-ring" onClick={() => setShowCreate(true)} type="button">
                <Plus size={18}/> Create Course
              </button>
            )}
          </div>

          {/* Channel Selector */}
          <div className="tr-channel-bar">
            <button className={`tr-channel-btn focus-ring ${channel === 'ALL' ? 'active all' : ''}`}
              onClick={() => setChannel('ALL')} type="button">
              <BookOpen size={18}/> All Training
              <span className="tr-channel-count">{courses.length}</span>
            </button>
            <button className={`tr-channel-btn focus-ring ${channel === 'NEW_HIRE' ? 'active new-hire' : ''}`}
              onClick={() => setChannel('NEW_HIRE')} type="button">
              <GraduationCap size={18}/> New Hire Training
              <span className="tr-channel-count">{newHireCount}</span>
            </button>
            <button className={`tr-channel-btn focus-ring ${channel === 'REFRESHER' ? 'active refresher' : ''}`}
              onClick={() => setChannel('REFRESHER')} type="button">
              <TrendingUp size={18}/> Refresher Training
              <span className="tr-channel-count">{refresherCount}</span>
            </button>
          </div>

          {/* Stats */}
          <div className="tr-stats-row">
            <StatCard icon={BookOpen} label="Total Courses" value={stats.total} accent="#3b82f6" delay={0}/>
            <StatCard icon={Star} label="Required" value={stats.required} accent="#f59e0b" delay={80}/>
            <StatCard icon={Flame} label="In Progress" value={stats.inProgress} accent="#8b5cf6" delay={160} total={stats.total > 0 ? stats.total : undefined}/>
            <StatCard icon={Trophy} label="Completed" value={stats.completed} accent="#10b981" delay={240} total={stats.total > 0 ? stats.total : undefined}/>
          </div>
        </div>

        {/* Showcase: hero + quiz side-by-side */}
        <div className="tr-showcase">
          <div className="tr-showcase-main">
            {courses.length > 0 ? <FeaturedHero courses={courses} enrollments={enrollmentByCourse}/> : <VideoPlayerPreview/>}
          </div>
          <div className="tr-showcase-side">
            <QuizPreviewWidget/>
          </div>
        </div>

        {/* Learning Path */}
        <LearningPath courses={courses} enrollments={enrollmentByCourse}/>

        {/* Tabs + Search */}
        <div className="tr-filter-bar">
          <div className="tr-tabs">
            {tabConfig.map(t => (
              <button key={t.id} className={`tr-tab focus-ring ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)} type="button">
                <t.icon size={17}/> {t.label}
                <span className="tr-tab-count">{t.count}</span>
              </button>
            ))}
          </div>
          <div className="tr-search-wrap">
            <Search size={16} className="tr-search-icon"/>
            <input className="tr-search-input focus-ring" placeholder="Search courses..." value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
        </div>

        {/* Course Grid */}
        <div className="tr-content">
          {filtered.length === 0 ? (
            <div className="tr-empty animate-slide-up">
              <div className="tr-empty-icon"><BookOpen size={40} color="var(--brand-light)"/></div>
              <h3>{search ? 'No courses match your search' : 'No courses yet'}</h3>
              <p>{search ? 'Try different keywords or clear your search.' : canCreate ? 'Create your first course to get your team started.' : 'Courses will appear here once your administrator sets them up.'}</p>
              {canCreate && !search && (
                <button className="btn btn-gradient focus-ring" onClick={() => setShowCreate(true)} type="button">
                  <Sparkles size={16}/> Create First Course
                </button>
              )}
            </div>
          ) : (
            <div className="tr-grid">
              {filtered.map((course, i) => (
                <CourseCard key={course.id} course={course} enrollment={enrollmentByCourse.get(course.id)} index={i}
                  isManager={canCreate} onAssign={() => setAssignCourse(course)} onTrack={() => setTrackerCourse(course)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth:580 }}>
            <div style={{ height:3, background:'var(--brand-gradient)', borderRadius:'24px 24px 0 0' }}/>
            <div className="modal-header" style={{ padding:'20px 24px 16px', borderBottom:'1px solid var(--border-subtle)' }}>
              <h3 style={{ display:'flex', alignItems:'center', gap:8 }}><Sparkles size={18} color="var(--brand-light)"/> Create Course</h3>
              <button className="btn btn-icon btn-ghost focus-ring" onClick={() => setShowCreate(false)} type="button"><X size={18}/></button>
            </div>
            <div className="modal-body" style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
              <div className="form-group">
                <label className="label">Title *</label>
                <input className="input focus-ring" value={form.title} onChange={e => setForm(f => ({...f, title:e.target.value}))} placeholder="e.g. HIPAA Compliance Basics" autoFocus/>
              </div>
              <div className="form-group">
                <label className="label">Description</label>
                <textarea className="input focus-ring" style={{ minHeight:80, resize:'vertical' }} value={form.description} onChange={e => setForm(f => ({...f, description:e.target.value}))} placeholder="Short summary of what learners will gain..."/>
              </div>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                <div className="form-group" style={{ flex:1, minWidth:160 }}>
                  <label className="label">Category</label>
                  <input className="input focus-ring" value={form.category} onChange={e => setForm(f => ({...f, category:e.target.value}))} placeholder="e.g. Compliance"/>
                </div>
                <div className="form-group" style={{ flex:1, minWidth:160 }}>
                  <label className="label">Pass threshold (%)</label>
                  <input className="input focus-ring" type="number" min={0} max={100} value={form.passThreshold} onChange={e => setForm(f => ({...f, passThreshold:Number(e.target.value)||70}))}/>
                </div>
              </div>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                <div className="form-group" style={{ flex:1, minWidth:160 }}>
                  <label className="label">Channel</label>
                  <select className="input focus-ring" value={form.channel ?? ''} onChange={e => setForm(f => ({...f, channel:e.target.value || null}))}>
                    <option value="">General (no channel)</option>
                    <option value="NEW_HIRE">New Hire Training</option>
                    <option value="REFRESHER">Refresher Training</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex:1, minWidth:160 }}>
                  <label className="label">Score Visibility</label>
                  <select className="input focus-ring" value={form.scoresVisibility} onChange={e => setForm(f => ({...f, scoresVisibility:e.target.value}))}>
                    <option value="ALL">Everyone sees their scores</option>
                    <option value="TRAINERS_ONLY">Trainers only</option>
                  </select>
                </div>
              </div>
              <div style={{ display:'flex', gap:20 }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.875rem', color:'var(--text-secondary)', cursor:'pointer' }}>
                  <input type="checkbox" checked={form.isRequired} onChange={e => setForm(f => ({...f, isRequired:e.target.checked}))}/>
                  <Star size={14}/> Required for all staff
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.875rem', color:'var(--text-secondary)', cursor:'pointer' }}>
                  <input type="checkbox" checked={form.isPublished} onChange={e => setForm(f => ({...f, isPublished:e.target.checked}))}/>
                  <Eye size={14}/> Publish immediately
                </label>
              </div>
            </div>
            <div className="modal-footer" style={{ padding:'16px 24px 20px', borderTop:'1px solid var(--border-subtle)' }}>
              <button className="btn btn-ghost focus-ring" onClick={() => setShowCreate(false)} type="button">Cancel</button>
              <button className="btn btn-gradient focus-ring" onClick={handleCreate} disabled={!form.title.trim()||saving} type="button">
                {saving ? <Loader2 size={16} className="spin"/> : <Zap size={16}/>} Create & Build
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Training Modal */}
      {assignCourse && canCreate && (
        <AssignModal
          course={assignCourse}
          users={users}
          departments={departments}
          onClose={() => setAssignCourse(null)}
          onAssigned={async () => {
            // Refresh courses to update enrollment counts
            const res = await fetch('/api/workryn/training/courses')
            if (res.ok) setCourses(await res.json())
          }}
        />
      )}

      {/* Completion Tracker Modal */}
      {trackerCourse && canCreate && (
        <CompletionTracker course={trackerCourse} onClose={() => setTrackerCourse(null)} />
      )}

      <style>{`
        .tr-page { position:relative; overflow:hidden; }

        /* ── Welcome Banner ── */
        .tr-welcome-banner {
          position:relative; z-index:1; margin:0 0 0; 
          overflow:hidden;
        }
        .tr-banner-bg { position:relative; }
        .tr-banner-img {
          width:100%; display:block; object-fit:cover;
          mask-image:linear-gradient(to bottom, transparent 0%, #000 15%, #000 65%, transparent 100%);
          -webkit-mask-image:linear-gradient(to bottom, transparent 0%, #000 15%, #000 65%, transparent 100%);
          opacity:0.85;
        }
        .tr-banner-gradient-bg {
          width:100%; height:100%;
          background:linear-gradient(135deg, #0c1629 0%, #1a2744 20%, #1e3a5f 45%, #0c4a6e 70%, #164e63 100%);
        }
        .tr-banner-overlay {
          position:absolute; inset:0;
          background:linear-gradient(180deg, rgba(8,12,20,0.5) 0%, rgba(8,12,20,0.75) 100%);
        }
        .tr-banner-content {
          position:relative; z-index:1; padding:48px 40px; display:flex;
          flex-direction:column; align-items:center; text-align:center; gap:14px;
        }
        .tr-banner-icon-ring {
          width:68px; height:68px; border-radius:50%; display:flex; align-items:center; justify-content:center;
          background:rgba(37,99,235,0.2); color:var(--brand-light);
          border:2px solid rgba(37,99,235,0.3); backdrop-filter:blur(8px);
          animation:tr-pulse 2.5s ease-in-out infinite;
        }
        .tr-banner-title {
          font-size:1.75rem; font-weight:800; color:#fff; margin:0;
          text-shadow:0 2px 12px rgba(0,0,0,0.4);
        }
        .tr-banner-subtitle {
          font-size:1rem; color:rgba(255,255,255,0.7); margin:0; max-width:500px; line-height:1.5;
        }

        /* ── YouTube Section ── */
        .tr-youtube-section {
          background:var(--glass-bg); backdrop-filter:var(--glass-blur);
          border:1px solid var(--border-subtle); border-radius:var(--radius-xl);
          padding:16px 16px 16px; overflow:hidden; max-width:720px; margin:0 auto;
        }
        .tr-youtube-wrapper {
          position:relative; width:100%; padding-top:56.25%;
          border-radius:var(--radius-lg); overflow:hidden;
          box-shadow:0 4px 20px rgba(0,0,0,0.3);
        }
        .tr-youtube-iframe {
          position:absolute; top:0; left:0; width:100%; height:100%;
          border:none; border-radius:var(--radius-lg);
        }

        /* ── Particles ── */
        .tr-particles { position:absolute; inset:0; pointer-events:none; z-index:0; overflow:hidden; }
        .tr-particle { position:absolute; border-radius:50%; background:var(--brand-light); animation:tr-float linear infinite; }
        @keyframes tr-float {
          0%,100% { transform:translateY(0) translateX(0) scale(1); opacity:0; }
          10% { opacity:0.2; } 50% { transform:translateY(-40px) translateX(20px) scale(1.3); } 90% { opacity:0.2; }
        }

        /* ── Header ── */
        .tr-header { padding:28px 32px 0; position:relative; z-index:1; }
        .tr-header-top { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:28px; }
        .tr-title { display:flex; align-items:center; gap:12px; font-size:1.625rem; margin-bottom:6px; }
        .tr-subtitle { font-size:0.9375rem; color:var(--text-muted); margin:0; }

        /* ── Stats ── */
        .tr-stats-row { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:28px; }
        @media (max-width:1000px) { .tr-stats-row { grid-template-columns:repeat(2,1fr); } }
        @media (max-width:540px) { .tr-stats-row { grid-template-columns:1fr; } }
        .tr-stat-card {
          display:flex; flex-direction:column; gap:16px; padding:24px; min-height:140px;
          background:var(--glass-bg); backdrop-filter:var(--glass-blur);
          border:1px solid var(--border-subtle); border-radius:var(--radius-lg);
          transition:all var(--transition-smooth);
        }
        .tr-stat-card:hover { border-color:var(--border-default); transform:translateY(-3px); box-shadow:0 8px 32px rgba(0,0,0,0.25); }
        .tr-stat-icon { width:52px; height:52px; border-radius:var(--radius-md); display:flex; align-items:center; justify-content:center; }
        .tr-stat-value { font-size:2.25rem; font-weight:800; color:var(--text-primary); line-height:1; letter-spacing:-0.03em; }
        .tr-stat-label { font-size:0.8125rem; color:var(--text-muted); font-weight:500; margin-top:4px; }

        /* ── Showcase Grid ── */
        .tr-showcase { display:grid; grid-template-columns:1.4fr 1fr; gap:20px; padding:0 32px 28px; position:relative; z-index:1; }
        @media (max-width:960px) { .tr-showcase { grid-template-columns:1fr; } }

        /* ── Hero Card ── */
        .tr-hero { border-radius:var(--radius-xl); overflow:hidden; position:relative; min-height:320px; cursor:pointer; transition:all var(--transition-smooth); }
        .tr-hero:hover { transform:translateY(-3px); box-shadow:0 12px 40px rgba(0,0,0,0.4); }
        .tr-hero-bg { position:absolute; inset:0; }
        .tr-hero-gradient { width:100%; height:100%; background:linear-gradient(135deg,#0f172a 0%,#1e293b 30%,#1e3a5f 60%,#0c4a6e 100%); }
        .tr-hero-overlay { position:absolute; inset:0; background:linear-gradient(180deg,rgba(0,0,0,0.15) 0%,rgba(0,0,0,0.75) 100%); }
        .tr-hero-content { position:relative; z-index:1; padding:28px 32px; display:flex; align-items:flex-end; justify-content:space-between; min-height:320px; }
        .tr-hero-left { flex:1; max-width:75%; }
        .tr-hero-badge { display:inline-flex; align-items:center; gap:5px; padding:4px 12px; border-radius:99px; font-size:0.6875rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; }
        .tr-badge-required { background:rgba(245,158,11,0.25); color:#fbbf24; }
        .tr-badge-completed { background:rgba(16,185,129,0.25); color:#34d399; }
        .tr-badge-progress { background:rgba(139,92,246,0.25); color:#a78bfa; }
        .tr-hero-category { font-size:0.75rem; color:var(--brand-light); text-transform:uppercase; letter-spacing:0.08em; font-weight:700; margin-bottom:8px; }
        .tr-hero-title { font-size:1.5rem; font-weight:800; color:#fff; margin-bottom:8px; line-height:1.25; }
        .tr-hero-desc { font-size:0.875rem; color:rgba(255,255,255,0.7); line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; margin-bottom:14px; }
        .tr-hero-meta { display:flex; align-items:center; gap:16px; font-size:0.8125rem; color:rgba(255,255,255,0.6); margin-bottom:18px; }
        .tr-hero-meta span { display:flex; align-items:center; gap:5px; }
        .tr-hero-cta {
          display:inline-flex; align-items:center; gap:10px; padding:10px 22px;
          background:rgba(37,99,235,0.85); color:#fff; border-radius:99px;
          font-size:0.875rem; font-weight:700; transition:all var(--transition-smooth);
          box-shadow:0 0 20px rgba(37,99,235,0.3);
        }
        .tr-hero:hover .tr-hero-cta { background:rgba(37,99,235,1); box-shadow:0 0 30px rgba(37,99,235,0.45); transform:translateX(4px); }
        .tr-hero-play-icon { display:flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:50%; background:rgba(255,255,255,0.2); }
        .tr-hero-right { display:flex; align-items:center; justify-content:center; }
        .tr-hero-play-ring {
          width:80px; height:80px; border-radius:50%; display:flex; align-items:center; justify-content:center;
          background:rgba(255,255,255,0.1); border:2px solid rgba(255,255,255,0.25);
          backdrop-filter:blur(8px); transition:all var(--transition-smooth);
          animation:tr-pulse 2.5s ease-in-out infinite;
        }
        .tr-hero:hover .tr-hero-play-ring { transform:scale(1.1); background:rgba(37,99,235,0.3); border-color:rgba(37,99,235,0.5); }
        @keyframes tr-pulse { 0%,100% { box-shadow:0 0 0 0 rgba(37,99,235,0); } 50% { box-shadow:0 0 0 12px rgba(37,99,235,0.15); } }
        @media (max-width:640px) { .tr-hero-right { display:none; } .tr-hero-left { max-width:100%; } }

        /* ── Quiz Widget ── */
        .tr-quiz-widget {
          background:var(--glass-bg); backdrop-filter:var(--glass-blur);
          border:1px solid var(--border-subtle); border-radius:var(--radius-xl);
          padding:24px; display:flex; flex-direction:column; gap:18px; height:100%;
        }
        .tr-quiz-header { display:flex; align-items:center; justify-content:space-between; }
        .tr-quiz-icon { width:44px; height:44px; border-radius:var(--radius-md); background:rgba(139,92,246,0.15); color:#a78bfa; display:flex; align-items:center; justify-content:center; }
        .tr-quiz-label { font-size:0.9375rem; font-weight:700; color:var(--text-primary); }
        .tr-quiz-sublabel { font-size:0.75rem; color:var(--text-muted); }
        .tr-quiz-badge-num { font-size:0.75rem; font-weight:700; color:var(--text-muted); background:var(--bg-overlay); padding:4px 10px; border-radius:99px; }
        .tr-quiz-question { font-size:0.9375rem; font-weight:600; color:var(--text-primary); line-height:1.5; }
        .tr-quiz-options { display:flex; flex-direction:column; gap:8px; }
        .tr-quiz-option {
          display:flex; align-items:center; gap:12px; padding:12px 16px;
          background:var(--bg-surface); border:1px solid var(--border-subtle);
          border-radius:var(--radius-md); cursor:pointer; transition:all var(--transition-smooth);
          font-size:0.8125rem; color:var(--text-secondary); text-align:left; width:100%;
        }
        .tr-quiz-option:hover { border-color:var(--border-default); background:var(--bg-hover); }
        .tr-quiz-option.selected { border-color:var(--brand); background:rgba(37,99,235,0.12); color:var(--text-primary); }
        .tr-quiz-option.correct { border-color:#10b981; background:rgba(16,185,129,0.12); color:#34d399; }
        .tr-quiz-option.wrong { border-color:#ef4444; background:rgba(239,68,68,0.12); color:#f87171; }
        .tr-quiz-letter {
          width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;
          font-size:0.75rem; font-weight:800; background:var(--bg-overlay); color:var(--text-muted); flex-shrink:0;
          transition:all var(--transition-smooth);
        }
        .tr-quiz-option.selected .tr-quiz-letter { background:var(--brand); color:#fff; }
        .tr-quiz-option.correct .tr-quiz-letter { background:#10b981; color:#fff; }
        .tr-quiz-option.wrong .tr-quiz-letter { background:#ef4444; color:#fff; }
        .tr-quiz-text { flex:1; }
        .tr-quiz-check { color:#10b981; flex-shrink:0; }
        .tr-quiz-actions { margin-top:auto; }
        .tr-quiz-result {
          display:flex; align-items:center; gap:8px; padding:8px 16px; border-radius:var(--radius-md);
          font-size:0.875rem; font-weight:700;
        }
        .tr-quiz-result.correct { background:rgba(16,185,129,0.15); color:#34d399; }
        .tr-quiz-result.wrong { background:rgba(239,68,68,0.15); color:#f87171; }

        /* ── Video Player ── */
        .tr-video-preview {
          border-radius:var(--radius-xl); overflow:hidden;
          border:1px solid var(--border-subtle); background:var(--glass-bg);
          backdrop-filter:var(--glass-blur);
        }
        .tr-video-screen {
          position:relative; height:220px; cursor:pointer; overflow:hidden;
          background:linear-gradient(135deg, #0c1629 0%, #1a1a2e 50%, #16213e 100%);
          display:flex; align-items:center; justify-content:center;
        }
        .tr-video-bg-pattern {
          position:absolute; inset:0; opacity:0.06;
          background-image:radial-gradient(circle at 25% 25%, #3b82f6 1px, transparent 1px),
                           radial-gradient(circle at 75% 75%, #8b5cf6 1px, transparent 1px);
          background-size:40px 40px;
        }
        .tr-video-center-play { position:relative; z-index:1; }
        .tr-video-play-btn {
          width:72px; height:72px; border-radius:50%; display:flex; align-items:center; justify-content:center;
          background:rgba(37,99,235,0.7); border:2px solid rgba(255,255,255,0.2);
          transition:all var(--transition-smooth); cursor:pointer;
          box-shadow:0 0 30px rgba(37,99,235,0.3);
        }
        .tr-video-screen:hover .tr-video-play-btn { transform:scale(1.1); background:rgba(37,99,235,0.9); box-shadow:0 0 40px rgba(37,99,235,0.5); }
        .tr-video-wave { display:flex; align-items:center; gap:4px; height:50px; }
        .tr-wave-bar {
          width:5px; border-radius:3px; background:var(--brand-light);
          animation:tr-wave 1s ease-in-out infinite alternate;
        }
        @keyframes tr-wave {
          0% { height:10px; opacity:0.4; } 100% { height:40px; opacity:1; }
        }
        .tr-video-lesson-label {
          position:absolute; bottom:14px; left:18px;
          display:flex; align-items:center; gap:6px;
          font-size:0.75rem; color:rgba(255,255,255,0.6); font-weight:500;
        }
        .tr-video-controls {
          display:flex; align-items:center; gap:10px; padding:12px 18px;
          border-top:1px solid var(--border-subtle);
        }
        .tr-vid-ctrl {
          background:none; border:none; color:var(--text-secondary); cursor:pointer;
          padding:4px; display:flex; align-items:center; transition:color 150ms;
        }
        .tr-vid-ctrl:hover { color:var(--text-primary); }
        .tr-vid-bar {
          flex:1; height:5px; border-radius:3px; background:rgba(255,255,255,0.1);
          position:relative; cursor:pointer;
        }
        .tr-vid-fill { height:100%; border-radius:3px; background:var(--brand); transition:width 100ms linear; }
        .tr-vid-thumb {
          position:absolute; top:50%; width:12px; height:12px; border-radius:50%;
          background:#fff; transform:translate(-50%,-50%); box-shadow:0 0 6px rgba(0,0,0,0.3);
          transition:left 100ms linear;
        }
        .tr-vid-time { font-size:0.6875rem; color:var(--text-muted); font-variant-numeric:tabular-nums; min-width:80px; }

        /* ── Learning Path ── */
        .tr-learning-path {
          margin:0 32px 28px; padding:24px; position:relative; z-index:1;
          background:var(--glass-bg); backdrop-filter:var(--glass-blur);
          border:1px solid var(--border-subtle); border-radius:var(--radius-xl);
        }
        .tr-section-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; }
        .tr-section-header h3 { font-size:1.0625rem; color:var(--text-primary); font-weight:700; }
        .tr-path-progress-wrap { display:flex; align-items:center; gap:10px; }
        .tr-path-progress-bar { width:120px; height:6px; border-radius:3px; background:rgba(255,255,255,0.08); overflow:hidden; }
        .tr-path-progress-fill { height:100%; border-radius:3px; background:var(--brand-gradient); transition:width 800ms cubic-bezier(0.4,0,0.2,1); }
        .tr-path-progress-text { font-size:0.75rem; font-weight:700; color:var(--brand-light); }
        .tr-path-track { display:flex; flex-direction:column; gap:8px; }
        .tr-path-node {
          display:flex; align-items:center; gap:14px; padding:14px 18px;
          background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md);
          transition:all var(--transition-smooth); cursor:pointer;
        }
        .tr-path-node:hover { border-color:var(--border-default); background:var(--bg-hover); transform:translateX(4px); }
        .tr-path-node.completed { border-left:3px solid #10b981; }
        .tr-path-node.active { border-left:3px solid var(--brand); background:rgba(37,99,235,0.06); }
        .tr-path-dot {
          width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center;
          background:var(--bg-overlay); color:var(--text-muted); font-size:0.8125rem; font-weight:800; flex-shrink:0;
        }
        .tr-path-node.completed .tr-path-dot { background:rgba(16,185,129,0.2); color:#10b981; }
        .tr-path-node.active .tr-path-dot { background:rgba(37,99,235,0.2); color:var(--brand-light); }
        .tr-path-info { flex:1; min-width:0; }
        .tr-path-title { font-size:0.875rem; font-weight:600; color:var(--text-primary); margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .tr-path-meta { display:flex; gap:12px; font-size:0.6875rem; color:var(--text-muted); }
        .tr-path-meta span { display:flex; align-items:center; gap:4px; }

        /* ── Filter Bar ── */
        .tr-filter-bar {
          padding:0 32px 20px; display:flex; align-items:center; justify-content:space-between;
          gap:16px; flex-wrap:wrap; position:relative; z-index:1;
          border-bottom:1px solid var(--border-subtle); margin:0 32px 0;
          padding-bottom:20px;
        }
        .tr-tabs { display:flex; gap:8px; flex-wrap:wrap; }
        .tr-tab {
          display:inline-flex; align-items:center; gap:8px; padding:11px 22px;
          border-radius:99px; font-size:0.9375rem; font-weight:600;
          color:var(--text-muted); background:var(--bg-elevated);
          border:1px solid var(--border-subtle); cursor:pointer;
          transition:all var(--transition-smooth);
        }
        .tr-tab:hover { color:var(--text-primary); border-color:var(--border-default); background:var(--bg-hover); }
        .tr-tab.active {
          color:#fff; border-color:transparent;
          background:var(--brand-gradient); box-shadow:var(--shadow-glow);
        }
        .tr-tab-count {
          min-width:24px; height:24px; padding:0 8px; border-radius:99px;
          background:rgba(255,255,255,0.12); font-size:0.75rem; font-weight:800;
          display:inline-flex; align-items:center; justify-content:center;
        }
        .tr-tab.active .tr-tab-count { background:rgba(255,255,255,0.25); }

        .tr-search-wrap { position:relative; min-width:260px; }
        .tr-search-icon { position:absolute; left:14px; top:50%; transform:translateY(-50%); color:var(--text-muted); pointer-events:none; }
        .tr-search-input {
          width:100%; padding:10px 14px 10px 40px; height:44px;
          background:var(--bg-surface); border:1px solid var(--border-subtle);
          border-radius:99px; color:var(--text-primary); font-size:0.875rem;
          outline:none; transition:all var(--transition-smooth);
        }
        .tr-search-input:focus { border-color:var(--brand); box-shadow:0 0 0 3px var(--brand-glow,rgba(37,99,235,0.15)); }
        .tr-search-input::placeholder { color:var(--text-muted); }

        /* ── Content / Grid ── */
        .tr-content { padding:28px 32px 40px; position:relative; z-index:1; }
        .tr-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:20px; }

        /* ── Course Card ── */
        .tr-course-card {
          border-radius:var(--radius-lg); overflow:hidden; display:flex; flex-direction:column;
          background:var(--glass-bg); backdrop-filter:var(--glass-blur);
          border:1px solid var(--border-subtle); transition:all var(--transition-smooth);
          height:100%; cursor:pointer;
        }
        .tr-course-card:hover {
          transform:translateY(-4px); border-color:var(--border-default);
          box-shadow:0 12px 40px rgba(0,0,0,0.3),0 0 20px rgba(37,99,235,0.08);
        }
        .tr-course-thumb { height:160px; position:relative; overflow:hidden; }
        .tr-course-thumb img { transition:transform 600ms cubic-bezier(0.4,0,0.2,1); }
        .tr-course-card:hover .tr-course-thumb img { transform:scale(1.06); }
        .tr-course-thumb-fallback {
          width:100%; height:100%; display:flex; align-items:center; justify-content:center;
          background:linear-gradient(135deg,#1e293b,#0f172a); color:rgba(255,255,255,0.3);
        }
        .tr-course-thumb-overlay {
          position:absolute; inset:0; background:rgba(0,0,0,0.3);
          display:flex; align-items:center; justify-content:center;
          opacity:0; transition:opacity var(--transition-smooth);
        }
        .tr-course-card:hover .tr-course-thumb-overlay { opacity:1; }
        .tr-course-play-hover {
          width:52px; height:52px; border-radius:50%; display:flex; align-items:center; justify-content:center;
          background:rgba(37,99,235,0.8); border:2px solid rgba(255,255,255,0.3);
          transform:scale(0.8); transition:transform var(--transition-spring);
        }
        .tr-course-card:hover .tr-course-play-hover { transform:scale(1); }
        .tr-course-badge {
          position:absolute; padding:3px 10px; border-radius:99px; font-size:0.6875rem;
          font-weight:700; text-transform:uppercase; display:flex; align-items:center; gap:4px;
        }
        .tr-cbr { top:10px; right:10px; background:rgba(245,158,11,0.85); color:#fff; }
        .tr-cbd { top:10px; left:10px; background:rgba(0,0,0,0.6); color:#fff; }
        .tr-cbc { bottom:10px; right:10px; background:rgba(16,185,129,0.85); color:#fff; }
        .tr-course-body { padding:18px 20px; flex:1; display:flex; flex-direction:column; gap:8px; }
        .tr-course-category { font-size:0.6875rem; color:var(--brand-light); font-weight:700; text-transform:uppercase; letter-spacing:0.06em; }
        .tr-course-title { font-size:1.0625rem; font-weight:700; color:var(--text-primary); line-height:1.3; }
        .tr-course-desc { font-size:0.8125rem; color:var(--text-muted); line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .tr-course-progress { display:flex; align-items:center; gap:10px; margin-top:4px; }
        .tr-cpb { flex:1; height:5px; border-radius:3px; background:rgba(255,255,255,0.08); overflow:hidden; }
        .tr-cpf { height:100%; border-radius:3px; background:linear-gradient(90deg,#8b5cf6,#a78bfa); transition:width 600ms ease; }
        .tr-cpt { font-size:0.6875rem; color:#a78bfa; font-weight:700; text-transform:uppercase; }
        .tr-course-footer {
          display:flex; align-items:center; gap:14px; margin-top:auto; padding-top:12px;
          border-top:1px solid var(--border-subtle); font-size:0.75rem; color:var(--text-muted);
        }
        .tr-course-footer span { display:flex; align-items:center; gap:4px; }
        .tr-course-arrow { margin-left:auto; color:var(--text-muted); transition:all var(--transition-smooth); }
        .tr-course-card:hover .tr-course-arrow { color:var(--brand-light); transform:translateX(4px); }

        /* ── Empty State ── */
        .tr-empty {
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          padding:64px 32px; text-align:center;
        }
        .tr-empty-icon {
          width:90px; height:90px; border-radius:50%;
          background:linear-gradient(135deg,rgba(37,99,235,0.12),rgba(139,92,246,0.12));
          display:flex; align-items:center; justify-content:center;
          margin-bottom:20px; animation:tr-float-empty 4s ease-in-out infinite;
        }
        @keyframes tr-float-empty { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-10px); } }
        .tr-empty h3 { font-size:1.25rem; color:var(--text-primary); margin-bottom:8px; }
        .tr-empty p { font-size:0.9375rem; color:var(--text-muted); max-width:420px; line-height:1.5; margin-bottom:20px; }

        .spin { animation:spin 0.7s linear infinite; }

        /* ── Assign Modal List ── */
        .tr-assign-list {
          max-height:300px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;
          scrollbar-width:thin; scrollbar-color:rgba(255,255,255,0.1) transparent;
        }
        .tr-assign-item {
          display:flex; align-items:center; gap:12px; padding:10px 14px;
          background:var(--bg-surface); border:1px solid var(--border-subtle);
          border-radius:var(--radius-md); cursor:pointer; transition:all var(--transition-smooth);
        }
        .tr-assign-item:hover { border-color:var(--border-default); background:var(--bg-hover); }
        .tr-assign-item.selected { border-color:var(--brand); background:rgba(37,99,235,0.08); }
        .tr-assign-item input[type="checkbox"] { accent-color:var(--brand); }

        /* ── Completion Tracker ── */
        .tr-tracker-stat {
          padding:14px 16px; background:var(--bg-surface); border:1px solid var(--border-subtle);
          border-radius:var(--radius-md); text-align:center;
        }
        .tr-tracker-stat-val { font-size:1.5rem; font-weight:800; color:var(--text-primary); }
        .tr-tracker-stat-label { font-size:0.75rem; color:var(--text-muted); font-weight:500; margin-top:2px; }
        .tr-tracker-list {
          max-height:350px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;
          scrollbar-width:thin; scrollbar-color:rgba(255,255,255,0.1) transparent;
        }
        .tr-tracker-row {
          display:flex; align-items:center; gap:12px; padding:10px 14px;
          background:var(--bg-surface); border:1px solid var(--border-subtle);
          border-radius:var(--radius-md); transition:all var(--transition-smooth);
        }
        .tr-tracker-row:hover { border-color:var(--border-default); }
        .tr-tracker-row.done { border-left:3px solid #10b981; }

        /* ── Course Card Admin Bar ── */
        .tr-course-admin-bar {
          display:flex; gap:6px; padding:0 16px 14px;
          border-top:1px solid var(--border-subtle);
          padding-top:10px;
        }
        .tr-course-admin-bar .btn { font-size:0.75rem; padding:5px 10px; }

        /* ── Channel Bar ── */
        .tr-channel-bar {
          display:flex; gap:10px; margin-bottom:28px; flex-wrap:wrap;
        }
        .tr-channel-btn {
          display:flex; align-items:center; gap:9px; padding:14px 24px;
          border-radius:var(--radius-lg); font-size:0.9375rem; font-weight:600;
          color:var(--text-muted); background:var(--glass-bg); backdrop-filter:var(--glass-blur);
          border:1px solid var(--border-subtle); cursor:pointer;
          transition:all var(--transition-smooth); flex:1; min-width:180px;
          justify-content:center;
        }
        .tr-channel-btn:hover { border-color:var(--border-default); color:var(--text-primary); background:var(--bg-hover); }
        .tr-channel-btn.active.all {
          border-color:var(--brand); color:var(--text-primary);
          background:rgba(37,99,235,0.1); box-shadow:0 0 20px rgba(37,99,235,0.12);
        }
        .tr-channel-btn.active.new-hire {
          border-color:#0d9488; color:#5eead4;
          background:rgba(13,148,136,0.12); box-shadow:0 0 20px rgba(13,148,136,0.15);
        }
        .tr-channel-btn.active.refresher {
          border-color:#d97706; color:#fbbf24;
          background:rgba(217,119,6,0.12); box-shadow:0 0 20px rgba(217,119,6,0.15);
        }
        .tr-channel-count {
          min-width:24px; height:24px; padding:0 8px; border-radius:99px;
          background:rgba(255,255,255,0.08); font-size:0.75rem; font-weight:800;
          display:inline-flex; align-items:center; justify-content:center;
        }
        .tr-channel-btn.active .tr-channel-count { background:rgba(255,255,255,0.15); }
      `}</style>
    </>
  )
}

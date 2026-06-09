'use client'

/**
 * TrainingClient — Aurora rebuild WITH RESTORED CONTENT (mint accent).
 *
 * Combines the Aurora aesthetic (mint glow hero, glass surfaces,
 * Mantine controls) with all the original training-center content
 * that was wiped in the first Aurora pass:
 *
 *   - WelcomeBanner (BLH-branded image) sitting BEHIND the Aurora
 *     mint glow + orbs + spotlight overlay.
 *   - YouTube welcome video iframe.
 *   - Sample HIPAA quiz widget (interactive, picks an answer).
 *   - FeaturedHero (cinematic required-course banner) as fallback.
 *   - VideoPlayerPreview (animated sample lesson player) as fallback.
 *   - LearningPath (vertical timeline of required courses with
 *     completion progress).
 *   - Background particles drifting across the page.
 *
 * Render order:
 *   1. <Particles/> — absolute-positioned drifting dots
 *   2. WELCOME HERO — banner image + mint Aurora overlay
 *   3. Channel tiles (All / New Hire / Refresher)
 *   4. Stat tiles (Total / Required / In Progress / Completed)
 *   5. SHOWCASE grid — YouTube on left, Quiz on right
 *   6. LearningPath panel (only if any required courses)
 *   7. Filter bar (search + tab segmented control)
 *   8. Course catalog grid
 *
 * API contracts preserved:
 *   POST  /api/workryn/training/courses
 *   POST  /api/workryn/training/courses/:id/assign
 *   GET   /api/workryn/training/courses/:id/report
 *   POST  /api/workryn/training/courses/:id/remind
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ActionIcon, Alert, Avatar, Badge, Box, Button, Card, Checkbox,
  Container, Group, Loader, Modal, Paper, Progress, SegmentedControl,
  SimpleGrid, Stack, Tabs, Text, TextInput, Textarea, ThemeIcon,
  Title, Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  ArrowRight, BarChart3, Bell, BookMarked, BookOpen, Brain,
  CheckCircle2, ChevronRight, Clock, Flame, GraduationCap, HelpCircle,
  Lock, Monitor, Pause, Play, PlayCircle, Plus, Search, Shield, Star,
  Target, TrendingUp, Trophy, Users, Video, Volume2, VolumeX,
  Zap, AlertTriangle, X,
} from 'lucide-react'
import { isManagerOrAbove } from '@/lib/workryn/permissions'
import { getInitials } from '@/lib/workryn/utils'
import { useCountUp } from '@/hooks/useCountUp'
import { useTilt, useMouseSpotlight } from '@/hooks/workrynEffects'

// ---------- Types ----------

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
  initialCourses: Course[]; initialEnrollments: Enrollment[]
  currentUser: { id: string; role: string }
  users?: StaffUser[]; departments?: Dept[]
}
type FilterTab = 'ALL' | 'MINE' | 'REQUIRED' | 'COMPLETED'

const STAT_THEMES = {
  mint:   { bar: 'linear-gradient(90deg,#6ee7b7,#10B981)', glow: 'rgba(52,211,153,0.35)', text: 'linear-gradient(135deg,#6ee7b7,#10B981)', color: 'teal'   as const },
  amber:  { bar: 'linear-gradient(90deg,#fbbf24,#F59E0B)', glow: 'rgba(245,158,11,0.35)', text: 'linear-gradient(135deg,#fcd34d,#F59E0B)', color: 'orange' as const },
  sky:    { bar: 'linear-gradient(90deg,#7dd3fc,#0EA5E9)', glow: 'rgba(14,165,233,0.35)', text: 'linear-gradient(135deg,#7dd3fc,#0EA5E9)', color: 'sky'    as const },
  violet: { bar: 'linear-gradient(90deg,#a78bfa,#7C3AED)', glow: 'rgba(124,58,237,0.35)', text: 'linear-gradient(135deg,#c4b5fd,#7C3AED)', color: 'violet' as const },
} as const

// =================================================================
// WELCOME CONFIG — edit here to change the banner / video / copy
// =================================================================

export const WELCOME_CONFIG = {
  // YouTube video ID (the part after v= in the URL). Set to null to hide.
  youtubeVideoId: 'yIeolU5ew28' as string | null,
  // Banner image URL. Set to null for gradient-only banner.
  bannerImage: '/images/training-banner.jpg' as string | null,
  // Banner text shown in the Aurora hero
  bannerTitle: 'Welcome to BLH Training',
  bannerSubtitle: 'Your hub for professional development, compliance training, and team growth.',
}

// =================================================================
// MAIN
// =================================================================

export default function TrainingClient({
  initialCourses, initialEnrollments, currentUser, users = [], departments = [],
}: Props) {
  const router = useRouter()
  const spot = useMouseSpotlight()

  const [courses, setCourses] = useState<Course[]>(initialCourses)
  const [enrollments] = useState<Enrollment[]>(initialEnrollments)
  const [channel, setChannel] = useState<'ALL' | 'NEW_HIRE' | 'REFRESHER'>('ALL')
  const [tab, setTab] = useState<FilterTab>('ALL')
  const [search, setSearch] = useState('')
  const [createModalOpened, createModal] = useDisclosure(false)
  const [assignCourse, setAssignCourse] = useState<Course | null>(null)
  const [trackerCourse, setTrackerCourse] = useState<Course | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '', description: '', category: '', isRequired: false,
    passThreshold: 70, isPublished: false,
    channel: null as string | null, scoresVisibility: 'ALL',
  })

  const canCreate = isManagerOrAbove(currentUser.role)
  const isManager = canCreate

  const enrollmentByCourse = useMemo(() => {
    const map = new Map<string, Enrollment>()
    enrollments.forEach((e) => map.set(e.courseId, e))
    return map
  }, [enrollments])

  const channelCourses = useMemo(() => {
    if (channel === 'ALL') return courses
    return courses.filter((c) => (c as any).channel === channel)
  }, [courses, channel])

  const stats = useMemo(() => {
    const src = channelCourses
    const total = src.filter((c) => c.isPublished).length
    const required = src.filter((c) => c.isRequired).length
    const enrolled = enrollments.filter((e) => channelCourses.some((c) => c.id === e.courseId))
    const inProgress = enrolled.filter((e) => e.status === 'IN_PROGRESS').length
    const completed = enrolled.filter((e) => e.status === 'COMPLETED').length
    return { total, required, inProgress, completed }
  }, [channelCourses, enrollments])

  const animTotal      = useCountUp(stats.total, 800)
  const animRequired   = useCountUp(stats.required, 800)
  const animInProgress = useCountUp(stats.inProgress, 800)
  const animCompleted  = useCountUp(stats.completed, 800)

  const filtered = useMemo(() => {
    return channelCourses.filter((c) => {
      if (search) {
        const q = search.toLowerCase()
        if (!c.title.toLowerCase().includes(q) &&
            !(c.description ?? '').toLowerCase().includes(q) &&
            !(c.category ?? '').toLowerCase().includes(q)) return false
      }
      const enrollment = enrollmentByCourse.get(c.id)
      switch (tab) {
        case 'MINE':      return Boolean(enrollment)
        case 'REQUIRED':  return c.isRequired
        case 'COMPLETED': return enrollment?.status === 'COMPLETED'
        default:          return true
      }
    })
  }, [channelCourses, tab, search, enrollmentByCourse])

  const newHireCount   = courses.filter((c) => (c as any).channel === 'NEW_HIRE').length
  const refresherCount = courses.filter((c) => (c as any).channel === 'REFRESHER').length

  async function handleCreate() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const payload = { ...form, channel: form.channel || null, scoresVisibility: form.scoresVisibility }
      const res = await fetch('/api/workryn/training/courses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const err = await res.json().catch(() => ({})); alert(err.error || 'Failed'); return }
      const created = await res.json()
      setCourses((prev) => [created, ...prev])
      createModal.close()
      setForm({ title: '', description: '', category: '', isRequired: false, passThreshold: 70, isPublished: false, channel: null, scoresVisibility: 'ALL' })
      router.push(`/w/training/builder?courseId=${created.id}`)
    } finally { setSaving(false) }
  }

  return (
    <>
      <Container size="xl" py="lg" className="tra-root">
        {/* Background particles drift behind everything */}
        <Particles />

        {/* ============ WELCOME HERO (banner image + Aurora mint glow overlay) ============ */}
        <div ref={spot.ref} onMouseMove={spot.onMouseMove} style={{ marginBottom: 20, position: 'relative', zIndex: 1 }}>
          <Paper radius="lg" p={0} className="tra-hero">
            {/* Banner image sits at the back */}
            {WELCOME_CONFIG.bannerImage && (
              <img
                src={WELCOME_CONFIG.bannerImage}
                alt=""
                className="tra-hero-banner-img"
                aria-hidden
              />
            )}
            {/* Aurora glow layered on top of the banner */}
            <div className="tra-hero-mesh" aria-hidden />
            <div className="tra-hero-orbs" aria-hidden>
              <span className="tra-orb tra-orb-1" />
              <span className="tra-orb tra-orb-2" />
              <span className="tra-orb tra-orb-3" />
            </div>
            <div className="tra-hero-spotlight" aria-hidden />

            <img src="/heroes/training.svg" alt="" aria-hidden="true" style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", height: "85%", zIndex: 1, opacity: 0.7, pointerEvents: "none" }} />
            {/* Vignette to keep text readable over the banner */}
            <div className="tra-hero-vignette" aria-hidden />

            <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg" style={{ position: 'relative', zIndex: 2, padding: '40px 32px' }}>
              <Stack gap={6} style={{ minWidth: 0, flex: 1 }}>
                <Group gap={8} align="center">
                  <GraduationCap size={14} style={{ color: 'rgba(110,231,183,0.9)' }} />
                  <Text size="xs" tt="uppercase" fw={700} c="teal.3" style={{ letterSpacing: '0.12em' }}>
                    Training Center
                  </Text>
                </Group>
                <Title order={1} className="tra-hero-title">
                  {WELCOME_CONFIG.bannerTitle}
                </Title>
                <Text size="sm" c="dimmed" style={{ maxWidth: 640 }}>
                  {WELCOME_CONFIG.bannerSubtitle}
                </Text>
                {canCreate && (
                  <Button
                    size="md" mt="sm"
                    leftSection={<Plus size={16} />}
                    onClick={createModal.open}
                    className="tra-btn-primary"
                    style={{ alignSelf: 'flex-start' }}
                  >
                    Create Course
                  </Button>
                )}
              </Stack>
            </Group>
          </Paper>
        </div>

        {/* ============ CHANNEL TILES ============ */}
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm" mb="md" style={{ position: 'relative', zIndex: 1 }}>
          <ChannelTile
            active={channel === 'ALL'}
            onClick={() => setChannel('ALL')}
            icon={BookOpen}
            label="All Training"
            count={courses.length}
            theme="mint"
            delay={0}
          />
          <ChannelTile
            active={channel === 'NEW_HIRE'}
            onClick={() => setChannel('NEW_HIRE')}
            icon={GraduationCap}
            label="New Hire Training"
            count={newHireCount}
            theme="sky"
            delay={80}
          />
          <ChannelTile
            active={channel === 'REFRESHER'}
            onClick={() => setChannel('REFRESHER')}
            icon={TrendingUp}
            label="Refresher Training"
            count={refresherCount}
            theme="amber"
            delay={160}
          />
        </SimpleGrid>

        {/* ============ STAT CARDS ============ */}
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm" mb="md" style={{ position: 'relative', zIndex: 1 }}>
          <StatCard label="Total Courses" value={animTotal}      icon={BookOpen}     theme="mint"   delay={0}   />
          <StatCard label="Required"      value={animRequired}   icon={Shield}       theme="amber"  delay={80}  />
          <StatCard label="In Progress"   value={animInProgress} icon={PlayCircle}   theme="sky"    delay={160} pct={stats.total > 0 ? Math.round((stats.inProgress / stats.total) * 100) : null} />
          <StatCard label="Completed"     value={animCompleted}  icon={Trophy}       theme="violet" delay={240} pct={stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : null} />
        </SimpleGrid>

        {/* ============ SHOWCASE — YouTube video + Sample quiz ============ */}
        <div className="tra-showcase" style={{ position: 'relative', zIndex: 1, marginBottom: 'var(--mantine-spacing-md)' }}>
          <div className="tra-showcase-main">
            {WELCOME_CONFIG.youtubeVideoId ? (
              <YouTubeWelcome videoId={WELCOME_CONFIG.youtubeVideoId} />
            ) : courses.length > 0 ? (
              <FeaturedHero courses={courses} enrollments={enrollmentByCourse} />
            ) : (
              <VideoPlayerPreview />
            )}
          </div>
          <div className="tra-showcase-side">
            <QuizPreviewWidget />
          </div>
        </div>

        {/* ============ LEARNING PATH ============ */}
        <LearningPath courses={courses} enrollments={enrollmentByCourse} />

        {/* ============ FILTER BAR ============ */}
        <Card radius="lg" p="md" withBorder mb="md" className="tra-panel" style={{ position: 'relative', zIndex: 1 }}>
          <Group gap="sm" align="center" wrap="wrap">
            <TextInput
              placeholder="Search courses, categories…"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              leftSection={<Search size={14} />}
              style={{ flex: 1, minWidth: 200 }}
            />
            <SegmentedControl
              size="sm"
              value={tab}
              onChange={(v) => setTab(v as FilterTab)}
              data={[
                { value: 'ALL',       label: 'All' },
                { value: 'MINE',      label: 'Mine' },
                { value: 'REQUIRED',  label: 'Required' },
                { value: 'COMPLETED', label: 'Completed' },
              ]}
              className="tra-view-toggle"
            />
          </Group>
        </Card>

        {/* ============ COURSE GRID ============ */}
        {filtered.length === 0 ? (
          <Card radius="lg" p="xl" withBorder className="tra-panel" style={{ position: 'relative', zIndex: 1 }}>
            <Stack align="center" gap="sm" py="xl">
              <ThemeIcon size={56} radius="xl" variant="light" color="teal">
                <BookOpen size={26} />
              </ThemeIcon>
              <Text c="dimmed">
                {search ? `No courses match "${search}"` :
                  tab === 'MINE' ? 'No enrolled courses yet' :
                  tab === 'COMPLETED' ? 'No completed courses yet' :
                  'No courses available'}
              </Text>
            </Stack>
          </Card>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="md" style={{ position: 'relative', zIndex: 1 }}>
            {filtered.map((course, idx) => (
              <CourseCard
                key={course.id}
                course={course}
                enrollment={enrollmentByCourse.get(course.id)}
                index={idx}
                isManager={isManager}
                onAssign={() => setAssignCourse(course)}
                onTrack={() => setTrackerCourse(course)}
              />
            ))}
          </SimpleGrid>
        )}
      </Container>

      {/* ============ CREATE COURSE MODAL ============ */}
      <Modal
        opened={createModalOpened}
        onClose={createModal.close}
        title="New Course"
        size="md"
        radius="lg"
        overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
        classNames={{ content: 'tra-modal-content' }}
      >
        <Stack gap="md">
          <TextInput label="Title" required autoFocus
            placeholder="e.g. HIPAA Privacy Compliance"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.currentTarget.value }))} />
          <Textarea label="Description"
            placeholder="What will learners get out of this course?"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.currentTarget.value }))}
            minRows={2} autosize maxRows={4} />
          <Group grow>
            <TextInput label="Category" placeholder="e.g. Compliance"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.currentTarget.value }))} />
            <TextInput label="Pass threshold (%)" type="number"
              value={String(form.passThreshold)}
              onChange={(e) => setForm((f) => ({ ...f, passThreshold: Number(e.currentTarget.value) || 70 }))} />
          </Group>
          <Group gap="md">
            <Checkbox label="Required" checked={form.isRequired}
              onChange={(e) => setForm((f) => ({ ...f, isRequired: e.currentTarget.checked }))} />
            <Checkbox label="Publish immediately" checked={form.isPublished}
              onChange={(e) => setForm((f) => ({ ...f, isPublished: e.currentTarget.checked }))} />
          </Group>
          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" color="gray" onClick={createModal.close}>Cancel</Button>
            <Button loading={saving} disabled={!form.title.trim()} onClick={handleCreate} className="tra-btn-primary">
              Create & Open Builder
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ============ ASSIGN MODAL ============ */}
      {assignCourse && (
        <AssignModal
          course={assignCourse}
          users={users}
          departments={departments}
          onClose={() => setAssignCourse(null)}
          onAssigned={() => { /* refresh handled by parent */ }}
        />
      )}

      {/* ============ TRACKER MODAL ============ */}
      {trackerCourse && (
        <CompletionTracker
          course={trackerCourse}
          onClose={() => setTrackerCourse(null)}
        />
      )}

      {/* ============ STYLES ============ */}
      <style>{`
        @keyframes tra-slide-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes tra-mesh-drift {
          0%, 100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(3%, -2%) scale(1.05); }
        }
        @keyframes tra-orb-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(40px,-30px)} }
        @keyframes tra-orb-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,25px)} }
        @keyframes tra-orb-c { 0%,100%{transform:translate(0,0)} 50%{transform:translate(20px,40px)} }
        @keyframes tra-particle-float {
          0%, 100% { transform: translateY(0) translateX(0) scale(1); opacity: 0; }
          10% { opacity: 0.20; }
          50% { transform: translateY(-40px) translateX(20px) scale(1.3); }
          90% { opacity: 0.20; }
        }
        @keyframes tra-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
          50% { box-shadow: 0 0 0 14px rgba(16,185,129,0.18); }
        }
        @keyframes tra-wave { 0% { height: 10px; opacity: 0.4; } 100% { height: 40px; opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .tra-root *, .tra-root *::before, .tra-root *::after {
            animation: none !important; transition: none !important;
          }
        }

        /* ── Background Particles ── */
        .tra-particles {
          position: absolute; inset: 0;
          pointer-events: none;
          z-index: 0;
          overflow: hidden;
        }
        .tra-particle {
          position: absolute; border-radius: 50%;
          background: #34D399;
          animation: tra-particle-float linear infinite;
        }

        /* ── HERO with banner image background ── */
        .tra-hero {
          position: relative; overflow: hidden;
          min-height: 260px;
          border: 1px solid rgba(52,211,153,0.32);
          background:
            linear-gradient(135deg, rgba(52,211,153,0.12) 0%, rgba(20,184,166,0.08) 50%, rgba(14,165,233,0.04) 100%),
            rgba(11,15,30,0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          box-shadow: 0 20px 60px -20px rgba(52,211,153,0.35), 0 1px 0 rgba(255,255,255,0.05) inset;
          animation: tra-slide-up 460ms ease-out backwards;
        }
        .tra-hero-banner-img {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          object-fit: cover;
          opacity: 0.45;
          z-index: 0;
          /* Soften the edges so the image blends into the Aurora glow */
          mask-image: linear-gradient(to bottom, transparent 0%, #000 18%, #000 70%, transparent 100%);
          -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 18%, #000 70%, transparent 100%);
        }
        .tra-hero-mesh {
          position: absolute; inset: -25%;
          background:
            radial-gradient(circle at 22% 30%, rgba(52,211,153,0.55), transparent 42%),
            radial-gradient(circle at 78% 25%, rgba(20,184,166,0.40), transparent 47%),
            radial-gradient(circle at 62% 82%, rgba(14,165,233,0.22), transparent 52%);
          filter: blur(40px);
          animation: tra-mesh-drift 22s ease-in-out infinite;
          z-index: 1; pointer-events: none;
          /* Multiply over the banner for the "behind glow" feel */
          mix-blend-mode: screen;
        }
        .tra-hero-orbs { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
        .tra-orb { position: absolute; border-radius: 50%; filter: blur(22px); opacity: 0.60; mix-blend-mode: screen; }
        .tra-orb-1 { width: 150px; height: 150px; top: 12%; left: 8%;
          background: radial-gradient(circle, #6ee7b7 0%, transparent 70%);
          animation: tra-orb-a 14s ease-in-out infinite; }
        .tra-orb-2 { width: 120px; height: 120px; top: 55%; left: 60%;
          background: radial-gradient(circle, #14B8A6 0%, transparent 70%);
          animation: tra-orb-b 16s ease-in-out infinite; }
        .tra-orb-3 { width: 90px; height: 90px; bottom: 10%; right: 12%;
          background: radial-gradient(circle, #7dd3fc 0%, transparent 70%);
          animation: tra-orb-c 18s ease-in-out infinite; }
        .tra-hero-spotlight {
          position: absolute; inset: 0; z-index: 1; pointer-events: none;
          background: radial-gradient(circle 400px at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.10), transparent 60%);
        }
        .tra-hero-vignette {
          position: absolute; inset: 0; z-index: 1; pointer-events: none;
          background: linear-gradient(180deg, rgba(11,15,30,0.10) 0%, rgba(11,15,30,0.55) 100%);
        }
        .tra-hero-title {
          font-size: clamp(2rem, 5vw, 3.25rem);
          font-weight: 800;
          letter-spacing: -0.035em;
          line-height: 1.05;
          margin: 0;
          background: linear-gradient(135deg, #ffffff 0%, #6ee7b7 50%, #10B981 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 2px 16px rgba(52,211,153,0.50));
          text-shadow: 0 2px 12px rgba(0,0,0,0.35);
        }
        .tra-btn-primary {
          background: linear-gradient(135deg, #10B981 0%, #14B8A6 100%);
          box-shadow: 0 6px 18px rgba(16,185,129,0.40);
          transition: transform 180ms ease, box-shadow 180ms ease;
          color: #fff;
        }
        .tra-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 28px rgba(16,185,129,0.55);
        }

        /* ── Channel tiles ── */
        .tra-channel-tile {
          position: relative; overflow: hidden;
          padding: 16px 18px;
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(12px) saturate(140%);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          border: 1px solid rgba(255,255,255,0.08);
          cursor: pointer;
          transition: all 200ms ease;
          animation: tra-slide-up 500ms ease-out backwards;
          will-change: transform;
        }
        .tra-channel-tile:hover {
          transform: translateY(-2px);
          border-color: var(--tra-tile-border-hover);
          box-shadow: 0 12px 30px var(--tra-tile-glow);
        }
        .tra-channel-tile-active {
          border-color: var(--tra-tile-border-active) !important;
          box-shadow: 0 10px 28px var(--tra-tile-glow);
          background: linear-gradient(135deg, var(--tra-tile-bg-1), var(--tra-tile-bg-2)) !important;
        }
        .tra-channel-tile-active::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: var(--tra-tile-bar);
        }

        /* ── Stat cards ── */
        .tra-stat-card {
          position: relative; overflow: hidden;
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(12px) saturate(140%);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          transition: box-shadow 260ms ease;
          animation: tra-slide-up 500ms ease-out backwards;
          will-change: transform;
        }
        .tra-stat-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: var(--tra-bar);
        }
        .tra-stat-card:hover {
          box-shadow: 0 14px 36px var(--tra-glow, rgba(52,211,153,0.35));
        }
        .tra-stat-value {
          font-size: clamp(1.5rem, 2.5vw, 1.9rem);
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.03em;
          font-variant-numeric: tabular-nums;
          background: var(--tra-text);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        /* ── Showcase grid: video left, quiz right ── */
        .tra-showcase {
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          gap: 20px;
        }
        @media (max-width: 960px) {
          .tra-showcase { grid-template-columns: 1fr; }
        }

        /* ── YouTube section ── */
        .tra-youtube-section {
          position: relative;
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          padding: 16px;
          overflow: hidden;
          animation: tra-slide-up 500ms 150ms ease-out backwards;
        }
        .tra-youtube-wrapper {
          position: relative; width: 100%; padding-top: 56.25%;
          border-radius: 12px; overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        }
        .tra-youtube-iframe {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          border: none; border-radius: 12px;
        }

        /* ── Quiz widget ── */
        .tra-quiz {
          position: relative;
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          padding: 22px;
          display: flex; flex-direction: column; gap: 16px;
          height: 100%;
          animation: tra-slide-up 500ms 200ms ease-out backwards;
        }
        .tra-quiz-icon {
          width: 42px; height: 42px; border-radius: 10px;
          background: rgba(168,85,247,0.18); color: #c084fc;
          display: flex; align-items: center; justify-content: center;
        }
        .tra-quiz-question {
          font-size: 0.9375rem; font-weight: 600; color: #f1f5f9;
          line-height: 1.5;
        }
        .tra-quiz-options { display: flex; flex-direction: column; gap: 8px; }
        .tra-quiz-option {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 14px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          cursor: pointer; transition: all 140ms ease;
          font-size: 0.8125rem; color: rgba(226,232,240,0.85);
          text-align: left; width: 100%;
          font-family: inherit;
        }
        .tra-quiz-option:hover {
          border-color: rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.06);
        }
        .tra-quiz-option.selected {
          border-color: #10B981;
          background: rgba(16,185,129,0.12);
          color: #ecfdf5;
        }
        .tra-quiz-option.correct {
          border-color: #10B981;
          background: rgba(16,185,129,0.16);
          color: #34d399;
        }
        .tra-quiz-option.wrong {
          border-color: #ef4444;
          background: rgba(239,68,68,0.14);
          color: #f87171;
        }
        .tra-quiz-letter {
          width: 26px; height: 26px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.6875rem; font-weight: 800;
          background: rgba(255,255,255,0.10); color: rgba(226,232,240,0.7);
          flex-shrink: 0;
          transition: all 140ms ease;
        }
        .tra-quiz-option.selected .tra-quiz-letter { background: #10B981; color: #fff; }
        .tra-quiz-option.correct .tra-quiz-letter { background: #10B981; color: #fff; }
        .tra-quiz-option.wrong .tra-quiz-letter { background: #ef4444; color: #fff; }
        .tra-quiz-result {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 14px; border-radius: 10px;
          font-size: 0.875rem; font-weight: 700;
        }
        .tra-quiz-result.correct { background: rgba(16,185,129,0.16); color: #34d399; }
        .tra-quiz-result.wrong { background: rgba(239,68,68,0.16); color: #f87171; }

        /* ── Video player preview (used as YouTube fallback) ── */
        .tra-video-preview {
          border-radius: 16px; overflow: hidden;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(14px);
          animation: tra-slide-up 500ms 150ms ease-out backwards;
        }
        .tra-video-screen {
          position: relative; height: 220px;
          cursor: pointer; overflow: hidden;
          background: linear-gradient(135deg, #0c1629 0%, #1a1a2e 50%, #16213e 100%);
          display: flex; align-items: center; justify-content: center;
        }
        .tra-video-bg-pattern {
          position: absolute; inset: 0; opacity: 0.06;
          background-image:
            radial-gradient(circle at 25% 25%, #34D399 1px, transparent 1px),
            radial-gradient(circle at 75% 75%, #14B8A6 1px, transparent 1px);
          background-size: 40px 40px;
        }
        .tra-video-play-btn {
          width: 72px; height: 72px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: rgba(16,185,129,0.7);
          border: 2px solid rgba(255,255,255,0.25);
          box-shadow: 0 0 30px rgba(16,185,129,0.35);
          transition: all 220ms ease;
          cursor: pointer;
        }
        .tra-video-screen:hover .tra-video-play-btn {
          transform: scale(1.1);
          background: rgba(16,185,129,0.9);
          box-shadow: 0 0 40px rgba(16,185,129,0.55);
        }
        .tra-video-wave { display: flex; align-items: center; gap: 4px; height: 50px; }
        .tra-wave-bar {
          width: 5px; border-radius: 3px;
          background: #6ee7b7;
          animation: tra-wave 1s ease-in-out infinite alternate;
        }
        .tra-video-lesson-label {
          position: absolute; bottom: 14px; left: 18px;
          display: flex; align-items: center; gap: 6px;
          font-size: 0.75rem; color: rgba(255,255,255,0.65); font-weight: 500;
        }
        .tra-video-controls {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 18px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .tra-vid-ctrl {
          background: none; border: none;
          color: rgba(226,232,240,0.8);
          cursor: pointer; padding: 4px;
          display: flex; align-items: center;
          transition: color 150ms;
        }
        .tra-vid-ctrl:hover { color: #f1f5f9; }
        .tra-vid-bar {
          flex: 1; height: 5px; border-radius: 3px;
          background: rgba(255,255,255,0.10);
          position: relative; cursor: pointer;
        }
        .tra-vid-fill {
          height: 100%; border-radius: 3px;
          background: linear-gradient(90deg, #10B981, #14B8A6);
          transition: width 100ms linear;
        }
        .tra-vid-thumb {
          position: absolute; top: 50%;
          width: 12px; height: 12px; border-radius: 50%;
          background: #fff;
          transform: translate(-50%, -50%);
          box-shadow: 0 0 6px rgba(0,0,0,0.4);
          transition: left 100ms linear;
        }
        .tra-vid-time {
          font-size: 0.6875rem; color: rgba(148,163,184,0.65);
          font-variant-numeric: tabular-nums; min-width: 80px;
        }

        /* ── Featured hero (used as YouTube fallback) ── */
        .tra-feat-hero {
          border-radius: 16px; overflow: hidden;
          position: relative; min-height: 320px;
          cursor: pointer;
          transition: all 220ms ease;
          animation: tra-slide-up 500ms 150ms ease-out backwards;
        }
        .tra-feat-hero:hover {
          transform: translateY(-3px);
          box-shadow: 0 16px 44px rgba(16,185,129,0.30);
        }
        .tra-feat-hero-bg { position: absolute; inset: 0; }
        .tra-feat-hero-gradient {
          width: 100%; height: 100%;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 30%, #134e4a 60%, #064e3b 100%);
        }
        .tra-feat-hero-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.75) 100%);
        }
        .tra-feat-hero-content {
          position: relative; z-index: 1;
          padding: 28px 32px;
          display: flex; align-items: flex-end; justify-content: space-between;
          min-height: 320px;
        }
        .tra-feat-hero-play-ring {
          width: 100px; height: 100px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.10);
          border: 2px solid rgba(255,255,255,0.25);
          backdrop-filter: blur(8px);
          transition: all 240ms ease;
          animation: tra-pulse 2.5s ease-in-out infinite;
        }
        .tra-feat-hero:hover .tra-feat-hero-play-ring {
          transform: scale(1.1);
          background: rgba(16,185,129,0.3);
          border-color: rgba(16,185,129,0.5);
        }
        @media (max-width: 640px) {
          .tra-feat-hero-right { display: none; }
        }

        /* ── Learning Path ── */
        .tra-path {
          position: relative;
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          padding: 22px;
          margin-bottom: 16px;
          animation: tra-slide-up 500ms 250ms ease-out backwards;
        }
        .tra-path-progress-bar {
          width: 140px; height: 6px; border-radius: 3px;
          background: rgba(255,255,255,0.08);
          overflow: hidden;
        }
        .tra-path-progress-fill {
          height: 100%; border-radius: 3px;
          background: linear-gradient(90deg, #10B981, #14B8A6);
          transition: width 800ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        .tra-path-track { display: flex; flex-direction: column; gap: 8px; }
        .tra-path-node {
          display: flex; align-items: center; gap: 14px;
          padding: 14px 18px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 10px;
          transition: all 160ms ease;
          cursor: pointer;
        }
        .tra-path-node:hover {
          border-color: rgba(255,255,255,0.14);
          background: rgba(16,185,129,0.06);
          transform: translateX(4px);
        }
        .tra-path-node.completed { border-left: 3px solid #10B981; }
        .tra-path-node.active     { border-left: 3px solid #14B8A6; background: rgba(20,184,166,0.08); }
        .tra-path-dot {
          width: 36px; height: 36px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.08); color: rgba(148,163,184,0.7);
          font-size: 0.8125rem; font-weight: 800; flex-shrink: 0;
        }
        .tra-path-node.completed .tra-path-dot { background: rgba(16,185,129,0.22); color: #34d399; }
        .tra-path-node.active    .tra-path-dot { background: rgba(20,184,166,0.22); color: #5eead4; }
        .tra-path-info { flex: 1; min-width: 0; }
        .tra-path-title {
          font-size: 0.875rem; font-weight: 600; color: #f1f5f9;
          margin-bottom: 3px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .tra-path-meta {
          display: flex; gap: 12px;
          font-size: 0.6875rem; color: rgba(148,163,184,0.7);
        }
        .tra-path-meta span { display: flex; align-items: center; gap: 4px; }

        /* ── Panel ── */
        .tra-panel {
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          animation: tra-slide-up 500ms 100ms ease-out backwards;
        }
        .tra-view-toggle [data-active] {
          background: linear-gradient(135deg, #10B981, #14B8A6) !important;
          color: #fff !important;
        }

        /* ── Course card ── */
        .tra-course-card {
          position: relative; overflow: hidden;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(12px) saturate(140%);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.06);
          transition: transform 220ms cubic-bezier(0.3,0.5,0.3,1), box-shadow 260ms ease, border-color 220ms ease;
          animation: tra-slide-up 500ms ease-out backwards;
          display: flex; flex-direction: column;
        }
        .tra-course-card:hover {
          transform: translateY(-3px);
          border-color: rgba(52,211,153,0.30);
          box-shadow: 0 18px 44px rgba(52,211,153,0.18);
        }
        .tra-course-thumb {
          position: relative;
          aspect-ratio: 16 / 9;
          overflow: hidden;
          background: linear-gradient(135deg, rgba(52,211,153,0.18), rgba(20,184,166,0.12));
          display: flex; align-items: center; justify-content: center;
        }
        .tra-course-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .tra-course-thumb-fallback { color: rgba(110,231,183,0.65); }
        .tra-course-thumb-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.55));
          opacity: 0;
          transition: opacity 220ms ease;
          display: flex; align-items: center; justify-content: center;
        }
        .tra-course-card:hover .tra-course-thumb-overlay { opacity: 1; }
        .tra-course-play {
          width: 54px; height: 54px;
          border-radius: 50%;
          background: linear-gradient(135deg, #10B981, #14B8A6);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 12px 30px rgba(16,185,129,0.45);
          transform: scale(0.85);
          transition: transform 240ms cubic-bezier(0.34,1.56,0.64,1);
        }
        .tra-course-card:hover .tra-course-play { transform: scale(1); }
        .tra-course-thumb-badges {
          position: absolute; top: 10px; left: 10px;
          display: flex; gap: 6px; flex-wrap: wrap;
          z-index: 2;
        }
        .tra-course-body { padding: 14px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
        .tra-course-title {
          font-size: 0.9375rem;
          font-weight: 700;
          color: #f1f5f9;
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .tra-course-desc {
          font-size: 0.8125rem;
          color: rgba(148,163,184,0.85);
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          flex: 1;
        }
        .tra-course-footer {
          display: flex; align-items: center; gap: 12px;
          padding-top: 10px;
          border-top: 1px solid rgba(255,255,255,0.04);
          font-size: 0.75rem;
          color: rgba(148,163,184,0.85);
        }
        .tra-course-admin-bar {
          padding: 8px 12px;
          border-top: 1px solid rgba(255,255,255,0.04);
          background: rgba(0,0,0,0.18);
          display: flex; gap: 6px;
        }

        /* Modal */
        .tra-modal-content {
          background: rgba(15, 23, 42, 0.85) !important;
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          border: 1px solid rgba(52,211,153,0.28);
        }
      `}</style>
    </>
  )
}

// =================================================================
// BACKGROUND PARTICLES
// =================================================================

function Particles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        size: 2 + Math.random() * 3,
        dur: 12 + Math.random() * 20,
        delay: Math.random() * 8,
        opacity: 0.15 + Math.random() * 0.25,
      })),
    [],
  )
  return (
    <div className="tra-particles" aria-hidden>
      {particles.map((p) => (
        <div
          key={p.id}
          className="tra-particle"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
            opacity: p.opacity,
          }}
        />
      ))}
    </div>
  )
}

// =================================================================
// YOUTUBE WELCOME VIDEO
// =================================================================

function YouTubeWelcome({ videoId }: { videoId: string }) {
  return (
    <div className="tra-youtube-section">
      <Group gap={10} align="center" mb="sm">
        <ThemeIcon size="lg" radius="md" variant="light" color="red">
          <Video size={18} />
        </ThemeIcon>
        <Stack gap={0}>
          <Text fw={700} size="sm">Welcome Video</Text>
          <Text size="xs" c="dimmed">Watch our introduction to get started</Text>
        </Stack>
      </Group>
      <div className="tra-youtube-wrapper">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`}
          title="Welcome to BLH Training"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="tra-youtube-iframe"
        />
      </div>
    </div>
  )
}

// =================================================================
// SAMPLE QUIZ WIDGET (interactive HIPAA preview)
// =================================================================

function QuizPreviewWidget() {
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const correctAnswer = 2
  const q = {
    question: 'Under HIPAA, a Covered Entity must report a breach of unsecured PHI to affected individuals within:',
    options: ['30 days of discovery', '45 days of discovery', '60 days of discovery', '90 days of discovery'],
  }

  return (
    <div className="tra-quiz">
      <Group justify="space-between" align="center">
        <Group gap={10} align="center">
          <div className="tra-quiz-icon"><Brain size={20} /></div>
          <Stack gap={0}>
            <Text fw={700} size="sm">Sample Quiz</Text>
            <Text size="xs" c="dimmed">HIPAA Compliance</Text>
          </Stack>
        </Group>
        <Badge size="sm" variant="default">1 / 10</Badge>
      </Group>

      <div className="tra-quiz-question">{q.question}</div>

      <div className="tra-quiz-options">
        {q.options.map((opt, i) => {
          let cls = 'tra-quiz-option'
          if (selectedAnswer === i && !revealed) cls += ' selected'
          if (revealed && i === correctAnswer) cls += ' correct'
          if (revealed && selectedAnswer === i && i !== correctAnswer) cls += ' wrong'
          return (
            <button key={i} className={cls} onClick={() => !revealed && setSelectedAnswer(i)} type="button">
              <span className="tra-quiz-letter">{String.fromCharCode(65 + i)}</span>
              <span style={{ flex: 1 }}>{opt}</span>
              {revealed && i === correctAnswer && <CheckCircle2 size={16} color="#10B981" />}
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: 'auto' }}>
        {!revealed ? (
          <Button
            fullWidth
            leftSection={<Zap size={14} />}
            disabled={selectedAnswer === null}
            onClick={() => selectedAnswer !== null && setRevealed(true)}
            className="tra-btn-primary"
          >
            Check Answer
          </Button>
        ) : (
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <div className={`tra-quiz-result ${selectedAnswer === correctAnswer ? 'correct' : 'wrong'}`}>
              {selectedAnswer === correctAnswer
                ? <><Trophy size={16} /> Correct!</>
                : <><X size={16} /> Answer is C</>}
            </div>
            <Button variant="subtle" color="gray" size="sm" onClick={() => { setSelectedAnswer(null); setRevealed(false) }}>
              Try Again
            </Button>
          </Group>
        )}
      </div>
    </div>
  )
}

// =================================================================
// FEATURED HERO (YouTube fallback when no video set + courses exist)
// =================================================================

function FeaturedHero({ courses, enrollments }: { courses: Course[]; enrollments: Map<string, Enrollment> }) {
  const featured = useMemo(() => {
    const req = courses.find((c) => c.isRequired && c.isPublished && enrollments.get(c.id)?.status !== 'COMPLETED')
    return req || courses.find((c) => c.isPublished) || courses[0]
  }, [courses, enrollments])
  if (!featured) return null
  const enrollment = enrollments.get(featured.id)
  const isCompleted = enrollment?.status === 'COMPLETED'
  const isInProgress = enrollment?.status === 'IN_PROGRESS'

  return (
    <Link href={`/w/training/courses/${featured.id}`} style={{ textDecoration: 'none' }}>
      <div className="tra-feat-hero">
        <div className="tra-feat-hero-bg">
          {featured.thumbnail
            ? <img src={featured.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div className="tra-feat-hero-gradient" />
          }
          <div className="tra-feat-hero-overlay" />
        </div>
        <div className="tra-feat-hero-content">
          <Stack gap={10} style={{ flex: 1, maxWidth: '75%' }}>
            <Group gap={6} wrap="wrap">
              {featured.isRequired && (
                <Badge size="xs" leftSection={<Star size={10} />} variant="filled" color="orange">Required</Badge>
              )}
              {isCompleted && (
                <Badge size="xs" leftSection={<CheckCircle2 size={10} />} variant="filled" color="teal">Completed</Badge>
              )}
              {isInProgress && (
                <Badge size="xs" leftSection={<Clock size={10} />} variant="filled" color="cyan">In Progress</Badge>
              )}
            </Group>
            {featured.category && (
              <Text size="xs" tt="uppercase" fw={700} c="teal.3" style={{ letterSpacing: '0.08em' }}>
                {featured.category}
              </Text>
            )}
            <Text fw={800} style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: '#fff', lineHeight: 1.15 }}>
              {featured.title}
            </Text>
            {featured.description && (
              <Text size="sm" c="rgba(255,255,255,0.75)" lineClamp={2}>{featured.description}</Text>
            )}
            <Group gap="lg" mt="xs">
              <Group gap={4}><PlayCircle size={14} color="rgba(255,255,255,0.75)" /><Text size="xs" c="rgba(255,255,255,0.75)">{featured._count.lessons} Lessons</Text></Group>
              <Group gap={4}><HelpCircle size={14} color="rgba(255,255,255,0.75)" /><Text size="xs" c="rgba(255,255,255,0.75)">{featured._count.quizzes} Quizzes</Text></Group>
              <Group gap={4}><Users size={14} color="rgba(255,255,255,0.75)" /><Text size="xs" c="rgba(255,255,255,0.75)">{featured._count.enrollments} Enrolled</Text></Group>
            </Group>
            <Group gap={6} mt="sm">
              <Button leftSection={<Play size={14} fill="#fff" />} rightSection={<ArrowRight size={14} />} className="tra-btn-primary">
                {isInProgress ? 'Continue Learning' : isCompleted ? 'Review Course' : 'Start Course'}
              </Button>
            </Group>
          </Stack>
          <div className="tra-feat-hero-right">
            <div className="tra-feat-hero-play-ring"><Play size={40} fill="rgba(255,255,255,0.9)" /></div>
          </div>
        </div>
      </div>
    </Link>
  )
}

// =================================================================
// VIDEO PLAYER PREVIEW (fallback for empty state)
// =================================================================

function VideoPlayerPreview() {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [muted, setMuted] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setProgress((p) => { if (p >= 100) { setPlaying(false); return 100 }; return p + 0.5 })
      }, 100)
    } else if (intervalRef.current) clearInterval(intervalRef.current)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing])

  return (
    <div className="tra-video-preview">
      <div className="tra-video-screen" onClick={() => setPlaying(!playing)}>
        <div className="tra-video-bg-pattern" />
        <div style={{ position: 'relative', zIndex: 1 }}>
          {playing ? (
            <div className="tra-video-wave">
              {[1, 2, 3, 4, 5].map((i) => <div key={i} className="tra-wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />)}
            </div>
          ) : (
            <div className="tra-video-play-btn"><Play size={32} fill="#fff" /></div>
          )}
        </div>
        <div className="tra-video-lesson-label">
          <Monitor size={14} /> Lesson 1: Understanding Protected Health Information
        </div>
      </div>
      <div className="tra-video-controls">
        <button className="tra-vid-ctrl" onClick={() => setPlaying(!playing)} type="button">
          {playing ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
        </button>
        <div className="tra-vid-bar">
          <div className="tra-vid-fill" style={{ width: `${progress}%` }} />
          <div className="tra-vid-thumb" style={{ left: `${progress}%` }} />
        </div>
        <span className="tra-vid-time">
          {Math.floor(progress * 0.12)}:{String(Math.floor((progress * 7.2) % 60)).padStart(2, '0')} / 12:00
        </span>
        <button className="tra-vid-ctrl" onClick={() => setMuted(!muted)} type="button">
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
      </div>
    </div>
  )
}

// =================================================================
// LEARNING PATH TIMELINE
// =================================================================

function LearningPath({ courses, enrollments }: { courses: Course[]; enrollments: Map<string, Enrollment> }) {
  const required = courses.filter((c) => c.isRequired && c.isPublished)
  if (required.length === 0) return null
  const completedCount = required.filter((c) => enrollments.get(c.id)?.status === 'COMPLETED').length

  return (
    <div className="tra-path" style={{ position: 'relative', zIndex: 1 }}>
      <Group justify="space-between" align="center" mb="md">
        <Group gap={10} align="center">
          <ThemeIcon size="md" radius="md" variant="light" color="teal">
            <Target size={16} />
          </ThemeIcon>
          <Text fw={700} size="md">Your Learning Path</Text>
        </Group>
        <Group gap={10} align="center">
          <div className="tra-path-progress-bar">
            <div className="tra-path-progress-fill"
              style={{ width: `${required.length > 0 ? (completedCount / required.length) * 100 : 0}%` }} />
          </div>
          <Text size="xs" fw={700} c="teal.4" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {completedCount}/{required.length}
          </Text>
        </Group>
      </Group>
      <div className="tra-path-track">
        {required.map((c, i) => {
          const enrollment = enrollments.get(c.id)
          const done = enrollment?.status === 'COMPLETED'
          const active = enrollment?.status === 'IN_PROGRESS'
          return (
            <Link key={c.id} href={`/w/training/courses/${c.id}`} style={{ textDecoration: 'none' }}>
              <div className={`tra-path-node ${done ? 'completed' : active ? 'active' : ''}`}>
                <div className="tra-path-dot">{done ? <CheckCircle2 size={18} /> : <span>{i + 1}</span>}</div>
                <div className="tra-path-info">
                  <div className="tra-path-title">{c.title}</div>
                  <div className="tra-path-meta">
                    <span><PlayCircle size={11} /> {c._count.lessons}</span>
                    <span><HelpCircle size={11} /> {c._count.quizzes}</span>
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: 'rgba(148,163,184,0.55)', flexShrink: 0 }} />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// =================================================================
// CHANNEL TILE
// =================================================================

function ChannelTile({
  active, onClick, icon: Icon, label, count, theme, delay,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ size?: number }>
  label: string
  count: number
  theme: 'mint' | 'sky' | 'amber'
  delay: number
}) {
  const themes = {
    mint:  { bar: 'linear-gradient(90deg,#6ee7b7,#10B981)', glow: 'rgba(52,211,153,0.30)',  bg1: 'rgba(52,211,153,0.14)',  bg2: 'rgba(20,184,166,0.06)',  borderActive: 'rgba(52,211,153,0.50)',  borderHover: 'rgba(52,211,153,0.30)', icon: '#34D399' },
    sky:   { bar: 'linear-gradient(90deg,#7dd3fc,#0EA5E9)', glow: 'rgba(14,165,233,0.30)',  bg1: 'rgba(14,165,233,0.14)',  bg2: 'rgba(6,182,212,0.06)',   borderActive: 'rgba(14,165,233,0.50)',  borderHover: 'rgba(14,165,233,0.30)', icon: '#7dd3fc' },
    amber: { bar: 'linear-gradient(90deg,#fbbf24,#F59E0B)', glow: 'rgba(245,158,11,0.30)',  bg1: 'rgba(245,158,11,0.14)',  bg2: 'rgba(249,115,22,0.06)',  borderActive: 'rgba(245,158,11,0.50)',  borderHover: 'rgba(245,158,11,0.30)', icon: '#fcd34d' },
  } as const
  const t = themes[theme]
  return (
    <button
      className={`tra-channel-tile${active ? ' tra-channel-tile-active' : ''}`}
      onClick={onClick}
      style={{
        animationDelay: `${delay}ms`,
        ['--tra-tile-bar' as string]: t.bar,
        ['--tra-tile-glow' as string]: t.glow,
        ['--tra-tile-bg-1' as string]: t.bg1,
        ['--tra-tile-bg-2' as string]: t.bg2,
        ['--tra-tile-border-active' as string]: t.borderActive,
        ['--tra-tile-border-hover' as string]: t.borderHover,
        textAlign: 'left',
        appearance: 'none',
      } as React.CSSProperties}
    >
      <Group gap="md" align="center" wrap="nowrap">
        <ThemeIcon size="xl" radius="md" variant="light" style={{ background: `${t.icon}24`, color: t.icon }}>
          <Icon size={22} />
        </ThemeIcon>
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: '0.05em' }}>
            Channel
          </Text>
          <Text fw={700} size="md" c="white">{label}</Text>
          <Text size="xs" c="dimmed">{count} {count === 1 ? 'course' : 'courses'}</Text>
        </Stack>
        {active && (
          <ThemeIcon size="sm" radius="xl" variant="filled" style={{ background: t.icon, color: '#0b0f1e' }}>
            <CheckCircle2 size={12} />
          </ThemeIcon>
        )}
      </Group>
    </button>
  )
}

// =================================================================
// STAT CARD (with optional progress %)
// =================================================================

function StatCard({
  label, value, icon: Icon, theme, delay, pct,
}: {
  label: string
  value: number | string
  icon: React.ComponentType<{ size?: number }>
  theme: keyof typeof STAT_THEMES
  delay: number
  pct?: number | null
}) {
  const tilt = useTilt(5)
  const cfg = STAT_THEMES[theme]
  return (
    <div
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      style={{ transition: 'transform 260ms cubic-bezier(0.3, 0.5, 0.3, 1)' }}
    >
      <Card
        radius="lg" p="md" withBorder
        className="tra-stat-card"
        style={{
          animationDelay: `${delay}ms`,
          ['--tra-bar' as string]: cfg.bar,
          ['--tra-glow' as string]: cfg.glow,
          ['--tra-text' as string]: cfg.text,
        } as React.CSSProperties}
      >
        <Group gap="sm" align="center" justify="space-between" wrap="nowrap">
          <Group gap="sm" align="center" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            <ThemeIcon size="lg" radius="md" variant="light" color={cfg.color}>
              <Icon size={16} />
            </ThemeIcon>
            <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
              <Text className="tra-stat-value">{value}</Text>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{label}</Text>
            </Stack>
          </Group>
          {pct !== null && pct !== undefined && (
            <ProgressRing pct={pct} color={cfg.color === 'teal' ? '#10B981' : cfg.color === 'sky' ? '#0EA5E9' : cfg.color === 'orange' ? '#F59E0B' : '#7C3AED'} />
          )}
        </Group>
      </Card>
    </div>
  )
}

function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const size = 44, stroke = 4
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)' }} />
      </svg>
      <span style={{
        position: 'absolute',
        fontSize: '0.625rem',
        fontWeight: 800,
        color: color,
        fontVariantNumeric: 'tabular-nums',
      }}>{pct}%</span>
    </div>
  )
}

// =================================================================
// COURSE CARD
// =================================================================

function CourseCard({
  course, enrollment, index, isManager, onAssign, onTrack,
}: {
  course: Course; enrollment: Enrollment | undefined; index: number
  isManager?: boolean; onAssign?: () => void; onTrack?: () => void
}) {
  const isCompleted = enrollment?.status === 'COMPLETED'
  const isInProgress = enrollment?.status === 'IN_PROGRESS'
  return (
    <div
      className="tra-course-card"
      style={{ animationDelay: `${Math.min(index * 50, 400)}ms` }}
    >
      <Link href={`/w/training/courses/${course.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div className="tra-course-thumb">
          {course.thumbnail
            ? <img src={course.thumbnail} alt="" />
            : <div className="tra-course-thumb-fallback"><BookOpen size={42} /></div>
          }
          <div className="tra-course-thumb-overlay">
            <div className="tra-course-play">
              <Play size={22} fill="#fff" color="#fff" />
            </div>
          </div>
          <div className="tra-course-thumb-badges">
            {course.isRequired && (
              <Badge size="xs" leftSection={<Star size={9} />} variant="filled" color="orange">Required</Badge>
            )}
            {!course.isPublished && (
              <Badge size="xs" leftSection={<Lock size={9} />} variant="filled" color="gray">Draft</Badge>
            )}
            {isCompleted && (
              <Badge size="xs" leftSection={<CheckCircle2 size={9} />} variant="filled" color="teal">Done</Badge>
            )}
          </div>
        </div>
        <div className="tra-course-body">
          {course.category && (
            <Text size="xs" tt="uppercase" fw={700} c="teal.4" style={{ letterSpacing: '0.06em' }}>
              {course.category}
            </Text>
          )}
          <div className="tra-course-title">{course.title}</div>
          {course.description && <div className="tra-course-desc">{course.description}</div>}
          {isInProgress && (
            <Stack gap={4} mt={4}>
              <Progress value={45} color="teal" size="xs" radius="xl" />
              <Text size="xs" c="dimmed" fw={600}>In Progress</Text>
            </Stack>
          )}
          <div className="tra-course-footer">
            <Group gap={4} align="center">
              <PlayCircle size={12} />
              <Text component="span" size="xs">{course._count.lessons}</Text>
            </Group>
            <Group gap={4} align="center">
              <HelpCircle size={12} />
              <Text component="span" size="xs">{course._count.quizzes}</Text>
            </Group>
            <Group gap={4} align="center">
              <Users size={12} />
              <Text component="span" size="xs">{course._count.enrollments}</Text>
            </Group>
            <ArrowRight size={14} style={{ marginLeft: 'auto', color: 'rgba(110,231,183,0.7)' }} />
          </div>
        </div>
      </Link>
      {isManager && (
        <div className="tra-course-admin-bar">
          <Button
            size="xs" variant="subtle" color="gray"
            leftSection={<Users size={12} />}
            onClick={(e) => { e.preventDefault(); onAssign?.() }}
            style={{ flex: 1 }}
          >
            Assign
          </Button>
          <Button
            size="xs" variant="subtle" color="gray"
            leftSection={<BarChart3 size={12} />}
            onClick={(e) => { e.preventDefault(); onTrack?.() }}
            style={{ flex: 1 }}
          >
            Track
          </Button>
        </div>
      )}
    </div>
  )
}

// =================================================================
// ASSIGN MODAL (unchanged behavior, same API contracts)
// =================================================================

function AssignModal({
  course, users, departments, onClose, onAssigned,
}: {
  course: Course; users: StaffUser[]; departments: Dept[]
  onClose: () => void; onAssigned: () => void
}) {
  const [mode, setMode] = useState<'users' | 'departments'>('users')
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [selectedDepts, setSelectedDepts] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ assigned: number; alreadyEnrolled: number } | null>(null)

  const filteredUsers = useMemo(() => {
    if (!search) return users
    const q = search.toLowerCase()
    return users.filter((u) => (u.name ?? '').toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q))
  }, [users, search])

  function toggleUser(id: string) {
    setSelectedUsers((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  }
  function toggleDept(id: string) {
    setSelectedDepts((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  }
  function selectAll() { setSelectedUsers(new Set(filteredUsers.map((u) => u.id))) }

  async function handleAssign() {
    const payload: { userIds?: string[]; departmentIds?: string[] } = {}
    if (mode === 'users' && selectedUsers.size > 0) payload.userIds = [...selectedUsers]
    if (mode === 'departments' && selectedDepts.size > 0) payload.departmentIds = [...selectedDepts]
    if (!payload.userIds?.length && !payload.departmentIds?.length) return
    setSaving(true)
    try {
      const res = await fetch(`/api/workryn/training/courses/${course.id}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const err = await res.json().catch(() => ({})); alert(err.error || 'Failed'); return }
      const data = await res.json()
      setResult(data); onAssigned()
    } finally { setSaving(false) }
  }

  return (
    <Modal
      opened
      onClose={onClose}
      title={<Group gap={8}><Users size={18} color="#10B981" /><Text fw={700}>Assign Training</Text></Group>}
      size="lg"
      radius="lg"
      overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
      classNames={{ content: 'tra-modal-content' }}
    >
      <Stack gap="md">
        <Card radius="md" p="md" withBorder>
          <Text size="xs" tt="uppercase" c="dimmed" fw={700} style={{ letterSpacing: '0.06em' }}>Assigning to</Text>
          <Text fw={700} size="md" mt={2}>{course.title}</Text>
        </Card>

        {result ? (
          <Stack align="center" gap="xs" py="lg">
            <ThemeIcon size={48} radius="xl" variant="light" color="teal">
              <CheckCircle2 size={26} />
            </ThemeIcon>
            <Text fw={700} size="md">{result.assigned} user{result.assigned !== 1 ? 's' : ''} assigned</Text>
            {result.alreadyEnrolled > 0 && (
              <Text size="sm" c="dimmed">{result.alreadyEnrolled} already enrolled (skipped)</Text>
            )}
          </Stack>
        ) : (
          <>
            <SegmentedControl
              value={mode}
              onChange={(v) => setMode(v as 'users' | 'departments')}
              data={[
                { value: 'users',       label: 'Individual Users' },
                { value: 'departments', label: 'By Department' },
              ]}
              fullWidth
            />
            {mode === 'users' ? (
              <>
                <Group gap="sm" align="center" wrap="nowrap">
                  <TextInput
                    placeholder="Search staff…"
                    value={search}
                    onChange={(e) => setSearch(e.currentTarget.value)}
                    leftSection={<Search size={14} />}
                    style={{ flex: 1 }}
                  />
                  <Button size="sm" variant="subtle" onClick={selectAll}>Select all</Button>
                </Group>
                <Box style={{ maxHeight: 320, overflowY: 'auto' }}>
                  <Stack gap={4}>
                    {filteredUsers.map((u) => (
                      <Card
                        key={u.id} p="xs" radius="md" withBorder
                        style={{
                          cursor: 'pointer',
                          background: selectedUsers.has(u.id) ? 'rgba(16,185,129,0.10)' : undefined,
                          borderColor: selectedUsers.has(u.id) ? 'rgba(16,185,129,0.45)' : undefined,
                        }}
                        onClick={() => toggleUser(u.id)}
                      >
                        <Group gap="sm" align="center" wrap="nowrap">
                          <Checkbox checked={selectedUsers.has(u.id)} onChange={() => toggleUser(u.id)} />
                          <Avatar size="sm" radius="xl" style={{ background: u.avatarColor, color: '#fff' }}>
                            {getInitials(u.name ?? '?')}
                          </Avatar>
                          <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                            <Text size="sm" fw={600} truncate>{u.name ?? 'Unnamed'}</Text>
                            {u.jobTitle && <Text size="xs" c="dimmed" truncate>{u.jobTitle}</Text>}
                          </Stack>
                        </Group>
                      </Card>
                    ))}
                  </Stack>
                </Box>
                <Text size="xs" c="dimmed">{selectedUsers.size} selected</Text>
              </>
            ) : (
              <Stack gap={4}>
                {departments.map((d) => (
                  <Card
                    key={d.id} p="xs" radius="md" withBorder
                    style={{
                      cursor: 'pointer',
                      background: selectedDepts.has(d.id) ? 'rgba(16,185,129,0.10)' : undefined,
                      borderColor: selectedDepts.has(d.id) ? 'rgba(16,185,129,0.45)' : undefined,
                    }}
                    onClick={() => toggleDept(d.id)}
                  >
                    <Group gap="sm" align="center" wrap="nowrap">
                      <Checkbox checked={selectedDepts.has(d.id)} onChange={() => toggleDept(d.id)} />
                      <ThemeIcon size="md" radius="md" variant="light" style={{ background: `${d.color}24`, color: d.color }}>
                        <Users size={14} />
                      </ThemeIcon>
                      <Stack gap={0} style={{ flex: 1 }}>
                        <Text size="sm" fw={600}>{d.name}</Text>
                        <Text size="xs" c="dimmed">{d._count.users} member{d._count.users !== 1 ? 's' : ''}</Text>
                      </Stack>
                    </Group>
                  </Card>
                ))}
              </Stack>
            )}
          </>
        )}

        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>{result ? 'Close' : 'Cancel'}</Button>
          {!result && (
            <Button
              loading={saving}
              disabled={mode === 'users' ? selectedUsers.size === 0 : selectedDepts.size === 0}
              onClick={handleAssign}
              leftSection={<Zap size={14} />}
              className="tra-btn-primary"
            >
              Assign {mode === 'users'
                ? `${selectedUsers.size} User${selectedUsers.size !== 1 ? 's' : ''}`
                : `${selectedDepts.size} Dept${selectedDepts.size !== 1 ? 's' : ''}`}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  )
}

// =================================================================
// COMPLETION TRACKER MODAL
// =================================================================

function CompletionTracker({ course, onClose }: { course: Course; onClose: () => void }) {
  const [report, setReport] = useState<{ course: { totalLessons: number }; enrollments: ReportEntry[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [reminding, setReminding] = useState(false)
  const [reminded, setReminded] = useState(false)

  useEffect(() => {
    fetch(`/api/workryn/training/courses/${course.id}/report`)
      .then((r) => r.json())
      .then((data) => { setReport(data); setLoading(false) })
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

  const completed = report?.enrollments.filter((e) => e.status === 'COMPLETED').length ?? 0
  const total = report?.enrollments.length ?? 0
  const incomplete = total - completed

  return (
    <Modal
      opened
      onClose={onClose}
      title={
        <Stack gap={2}>
          <Group gap={8}><BarChart3 size={18} color="#10B981" /><Text fw={700}>Completion Tracker</Text></Group>
          <Text size="xs" c="dimmed">{course.title}</Text>
        </Stack>
      }
      size="xl"
      radius="lg"
      overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
      classNames={{ content: 'tra-modal-content' }}
    >
      {loading ? (
        <Stack align="center" gap="sm" py="xl">
          <Loader color="teal" />
        </Stack>
      ) : !report || total === 0 ? (
        <Stack align="center" gap="sm" py="xl">
          <Text c="dimmed">No enrollments yet</Text>
        </Stack>
      ) : (
        <Stack gap="md">
          <SimpleGrid cols={3} spacing="sm">
            <Card radius="md" p="md" withBorder>
              <Text size="lg" fw={800} ta="center">{total}</Text>
              <Text size="xs" c="dimmed" ta="center" tt="uppercase" fw={700}>Enrolled</Text>
            </Card>
            <Card radius="md" p="md" withBorder>
              <Text size="lg" fw={800} ta="center" c="teal.4">{completed}</Text>
              <Text size="xs" c="dimmed" ta="center" tt="uppercase" fw={700}>Completed</Text>
            </Card>
            <Card radius="md" p="md" withBorder>
              <Text size="lg" fw={800} ta="center" c={incomplete > 0 ? 'orange.4' : 'dimmed'}>{incomplete}</Text>
              <Text size="xs" c="dimmed" ta="center" tt="uppercase" fw={700}>Incomplete</Text>
            </Card>
          </SimpleGrid>

          <Group gap="sm" align="center" wrap="nowrap">
            <Progress value={total > 0 ? (completed / total) * 100 : 0} color="teal" size="md" radius="xl" style={{ flex: 1 }} />
            <Text size="sm" fw={700} c="teal.4">{total > 0 ? Math.round((completed / total) * 100) : 0}%</Text>
          </Group>

          {incomplete > 0 && (
            <Button
              size="sm" variant="light" color="teal"
              leftSection={reminded ? <CheckCircle2 size={14} /> : <Bell size={14} />}
              loading={reminding}
              disabled={reminded}
              onClick={handleRemindAll}
              style={{ alignSelf: 'flex-start' }}
            >
              {reminded ? 'Reminders Sent' : `Remind All Incomplete (${incomplete})`}
            </Button>
          )}

          <Box style={{ maxHeight: 360, overflowY: 'auto' }}>
            <Stack gap={4}>
              {report.enrollments.map((e) => {
                const pct = e.totalLessons > 0 ? Math.round((e.lessonsCompleted / e.totalLessons) * 100) : 0
                const isDone = e.status === 'COMPLETED'
                return (
                  <Card key={e.enrollmentId} radius="md" p="xs" withBorder style={{ opacity: isDone ? 0.85 : 1 }}>
                    <Group gap="sm" align="center" wrap="nowrap">
                      <Avatar size="sm" radius="xl" style={{ background: e.user.avatarColor, color: '#fff' }}>
                        {getInitials(e.user.name ?? '?')}
                      </Avatar>
                      <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                        <Group gap={6} align="center">
                          <Text size="sm" fw={600} truncate>{e.user.name ?? e.user.email}</Text>
                          {isDone && <CheckCircle2 size={13} color="#10B981" />}
                        </Group>
                        <Text size="xs" c="dimmed" truncate>
                          {e.user.department?.name ?? 'No dept'} · {e.lessonsCompleted}/{e.totalLessons} lessons · Enrolled {new Date(e.enrolledAt).toLocaleDateString()}
                        </Text>
                      </Stack>
                      <Group gap="xs" align="center" style={{ flexShrink: 0 }}>
                        <Box style={{ width: 70 }}>
                          <Progress value={pct} color={isDone ? 'teal' : 'blue'} size="xs" radius="xl" />
                        </Box>
                        <Text size="xs" fw={700} c={isDone ? 'teal.4' : 'dimmed'} style={{ minWidth: 32 }}>{pct}%</Text>
                        {!isDone && (
                          <Tooltip label="Send reminder" withArrow>
                            <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => handleRemindOne(e.user.id)}>
                              <Bell size={12} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Group>
                    </Group>
                  </Card>
                )
              })}
            </Stack>
          </Box>
        </Stack>
      )}
    </Modal>
  )
}

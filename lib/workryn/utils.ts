export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function timeAgo(date: Date | string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(date)
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'URGENT': return '#ef4444'
    case 'HIGH': return '#f97316'
    case 'MEDIUM': return '#f59e0b'
    case 'LOW': return '#22c55e'
    default: return '#94a3b8'
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'DONE': return '#10b981'
    case 'IN_PROGRESS': return '#6366f1'
    case 'IN_REVIEW': return '#f59e0b'
    case 'TODO': return '#64748b'
    default: return '#64748b'
  }
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function generateInviteUrl(token: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/accept-invite?token=${token}`
  }
  return `/accept-invite?token=${token}`
}

export function isExpired(date: Date | string): boolean {
  return new Date(date) < new Date()
}

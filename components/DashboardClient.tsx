'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  Client,
  Profile,
  FilterType,
  isOverdue,
  isDueThisWeek,
  isEligibilityEndingSoon,
  getDaysSinceContact,
} from '@/lib/types'
import FilterBar from './FilterBar'
import ClientGrid from './ClientGrid'
import PinnedClients from './PinnedClients'

interface Props {
  clients: Client[]
  profile: Profile | null
  currentUserId: string
}

type Tab = 'my_cases' | 'all_clients' | 'supervisor'

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '16px 20px' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

export default function DashboardClient({ clients, profile, currentUserId }: Props) {
  const isSupervisor = profile?.role === 'supervisor'
  const [tab, setTab] = useState<Tab>(isSupervisor ? 'all_clients' : 'my_cases')
  const [filter, setFilter] = useState<FilterType>('all')
  const [search, setSearch] = useState('')
  const [pinnedIds, setPinnedIds] = useState<string[]>([])

  // Load pins from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`casesync-pins-${currentUserId}`)
      if (stored) setPinnedIds(JSON.parse(stored))
    } catch {}
  }, [currentUserId])

  function togglePin(id: string) {
    setPinnedIds(prev => {
      let next: string[]
      if (prev.includes(id)) {
        next = prev.filter(p => p !== id)
      } else {
        if (prev.length >= 5) return prev // max 5
        next = [...prev, id]
      }
      try {
        localStorage.setItem(`casesync-pins-${currentUserId}`, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  // Tab-filtered base
  const baseClients = useMemo(() => {
    if (tab === 'my_cases') {
      return clients.filter(c => c.assigned_to === currentUserId)
    }
    return clients
  }, [clients, tab, currentUserId])

  // Stats (over all accessible clients)
  const stats = useMemo(() => ({
    total: baseClients.length,
    overdue: baseClients.filter(isOverdue).length,
    dueThisWeek: baseClients.filter(isDueThisWeek).length,
    noContact: baseClients.filter(c => {
      const d = getDaysSinceContact(c.last_contact_date)
      return d !== null && d >= 7
    }).length,
  }), [baseClients])

  // Search + filter
  const filtered = useMemo(() => {
    let result = baseClients

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.client_id.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        (c.first_name?.toLowerCase().includes(q) ?? false) ||
        (c.eligibility_code?.toLowerCase().includes(q) ?? false)
      )
    }

    // Filter
    switch (filter) {
      case 'overdue':
        result = result.filter(isOverdue)
        break
      case 'due_this_week':
        result = result.filter(isDueThisWeek)
        break
      case 'no_contact_7':
        result = result.filter(c => {
          const d = getDaysSinceContact(c.last_contact_date)
          return d !== null && d >= 7
        })
        break
      case 'eligibility_ending_soon':
        result = result.filter(isEligibilityEndingSoon)
        break
      case 'co':
        result = result.filter(c => c.category === 'co')
        break
      case 'cfc':
        result = result.filter(c => c.category === 'cfc')
        break
      case 'cpas':
        result = result.filter(c => c.category === 'cpas')
        break
    }

    return result
  }, [baseClients, search, filter])

  // Supervisor analytics
  const byCategory = useMemo(() => ({
    co: clients.filter(c => c.category === 'co').length,
    cfc: clients.filter(c => c.category === 'cfc').length,
    cpas: clients.filter(c => c.category === 'cpas').length,
  }), [clients])

  const tabs: { key: Tab; label: string; visible: boolean }[] = [
    { key: 'my_cases', label: 'My Cases', visible: true },
    { key: 'all_clients', label: 'All Clients', visible: isSupervisor },
    { key: 'supervisor', label: '📊 Overview', visible: isSupervisor },
  ]

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {tabs.filter(t => t.visible).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`tab ${tab === t.key ? 'active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Supervisor Overview tab */}
      {tab === 'supervisor' ? (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Supervisor Overview</h2>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
            <StatCard label="Total Clients" value={clients.length} />
            <StatCard label="Overdue" value={clients.filter(isOverdue).length} color="var(--red)" />
            <StatCard label="Due This Week" value={clients.filter(isDueThisWeek).length} color="var(--orange)" />
            <StatCard label="No Contact 7+" value={clients.filter(c => {
              const d = getDaysSinceContact(c.last_contact_date)
              return d !== null && d >= 7
            }).length} color="var(--yellow)" />
            <StatCard label="CO" value={byCategory.co} />
            <StatCard label="CFC" value={byCategory.cfc} />
            <StatCard label="CPAS" value={byCategory.cpas} />
          </div>

          {/* All overdue clients */}
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>
            Overdue Clients
          </h3>
          <ClientGrid
            clients={clients.filter(isOverdue)}
            pinnedIds={pinnedIds}
            onTogglePin={togglePin}
          />
        </div>
      ) : (
        <div>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 24 }}>
            <StatCard label="Total" value={stats.total} />
            <StatCard label="Overdue" value={stats.overdue} color="var(--red)" />
            <StatCard label="Due This Week" value={stats.dueThisWeek} color="var(--orange)" />
            <StatCard label="No Contact 7+" value={stats.noContact} color="var(--yellow)" />
          </div>

          {/* Pinned */}
          <PinnedClients clients={clients} pinnedIds={pinnedIds} onUnpin={togglePin} />

          {/* Filters */}
          <FilterBar
            activeFilter={filter}
            search={search}
            onFilterChange={setFilter}
            onSearchChange={setSearch}
          />

          {/* Results count */}
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Showing {filtered.length} of {baseClients.length} clients
          </div>

          {/* Grid */}
          <ClientGrid
            clients={filtered}
            pinnedIds={pinnedIds}
            onTogglePin={togglePin}
          />
        </div>
      )}
    </div>
  )
}

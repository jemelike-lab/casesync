'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Client,
  Profile,
  FilterType,
  SortField,
  SortDir,
  isOverdue,
  isDueThisWeek,
  isEligibilityEndingSoon,
  getDaysSinceContact,
} from '@/lib/types'
import FilterBar from './FilterBar'
import ClientGrid from './ClientGrid'
import PinnedClients from './PinnedClients'
import { createClient } from '@/lib/supabase/client'

interface Props {
  clients: Client[]
  profile: Profile | null
  currentUserId: string
  planners?: Profile[]
}

function StatCard({ label, value, color, onClick, active }: {
  label: string; value: number; color?: string; onClick?: () => void; active?: boolean
}) {
  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        textAlign: 'center',
        padding: '16px 20px',
        cursor: onClick ? 'pointer' : 'default',
        borderColor: active ? 'var(--accent)' : undefined,
        transition: 'border-color 0.2s',
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function AlertBanner({ overdue, dueThisWeek, eligibilitySoon, activeAlert, onAlert }: {
  overdue: number; dueThisWeek: number; eligibilitySoon: number;
  activeAlert: FilterType | null; onAlert: (f: FilterType | null) => void
}) {
  if (overdue === 0 && dueThisWeek === 0 && eligibilitySoon === 0) return null

  return (
    <div style={{
      background: 'rgba(255,69,58,0.08)',
      border: '1px solid rgba(255,69,58,0.25)',
      borderRadius: 10,
      padding: '10px 16px',
      marginBottom: 20,
      display: 'flex',
      gap: 16,
      flexWrap: 'wrap',
      alignItems: 'center',
    }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Alerts:</span>
      {overdue > 0 && (
        <button
          onClick={() => onAlert(activeAlert === 'overdue' ? null : 'overdue')}
          style={{
            background: activeAlert === 'overdue' ? 'rgba(255,69,58,0.2)' : 'transparent',
            border: '1px solid rgba(255,69,58,0.4)',
            borderRadius: 6,
            color: 'var(--red)',
            fontSize: 12,
            fontWeight: 600,
            padding: '4px 10px',
            cursor: 'pointer',
            minHeight: 28,
          }}
        >
          🔴 {overdue} overdue
        </button>
      )}
      {dueThisWeek > 0 && (
        <button
          onClick={() => onAlert(activeAlert === 'due_this_week' ? null : 'due_this_week')}
          style={{
            background: activeAlert === 'due_this_week' ? 'rgba(255,159,10,0.2)' : 'transparent',
            border: '1px solid rgba(255,159,10,0.4)',
            borderRadius: 6,
            color: 'var(--orange)',
            fontSize: 12,
            fontWeight: 600,
            padding: '4px 10px',
            cursor: 'pointer',
            minHeight: 28,
          }}
        >
          🟠 {dueThisWeek} due this week
        </button>
      )}
      {eligibilitySoon > 0 && (
        <button
          onClick={() => onAlert(activeAlert === 'eligibility_ending_soon' ? null : 'eligibility_ending_soon')}
          style={{
            background: activeAlert === 'eligibility_ending_soon' ? 'rgba(255,214,10,0.2)' : 'transparent',
            border: '1px solid rgba(255,214,10,0.4)',
            borderRadius: 6,
            color: 'var(--yellow)',
            fontSize: 12,
            fontWeight: 600,
            padding: '4px 10px',
            cursor: 'pointer',
            minHeight: 28,
          }}
        >
          ⏳ {eligibilitySoon} eligibility ending soon
        </button>
      )}
    </div>
  )
}

function exportToCsv(clients: Client[]) {
  const headers = [
    'Client ID', 'Last Name', 'First Name', 'Category', 'Eligibility Code', 'Eligibility End Date',
    'Last Contact Date', 'Last Contact Type', 'Goal %', 'POS Status', 'Assigned To',
    'Assessment Due', 'SPM Next Due', 'Overdue'
  ]
  const rows = clients.map(c => [
    c.client_id, c.last_name, c.first_name ?? '',
    c.category, c.eligibility_code ?? '', c.eligibility_end_date ?? '',
    c.last_contact_date ?? '', c.last_contact_type ?? '',
    c.goal_pct, c.pos_status ?? '', c.profiles?.full_name ?? '',
    c.assessment_due ?? '', c.spm_next_due ?? '', isOverdue(c) ? 'Yes' : 'No'
  ])
  const csv = [headers, ...rows].map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n')

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `casesync-export-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function DashboardClient({ clients: initialClients, profile, currentUserId, planners = [] }: Props) {
  const isSupervisor = profile?.role === 'supervisor'
  const isTeamManager = profile?.role === 'team_manager'
  const canSeeAll = isSupervisor || isTeamManager

  const [clients, setClients] = useState<Client[]>(initialClients)
  const [filter, setFilter] = useState<FilterType>('all')
  const [alertFilter, setAlertFilter] = useState<FilterType | null>(null)
  const [search, setSearch] = useState('')
  const [pinnedIds, setPinnedIds] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showSelect, setShowSelect] = useState(false)
  const [activePlannerId, setActivePlannerId] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [bulkAssignId, setBulkAssignId] = useState('')
  const [bulkAssigning, setBulkAssigning] = useState(false)

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
        if (prev.length >= 5) return prev
        next = [...prev, id]
      }
      try {
        localStorage.setItem(`casesync-pins-${currentUserId}`, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  function handleSortChange(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function handleAlertClick(f: FilterType | null) {
    setAlertFilter(f)
    if (f) setFilter(f)
    else setFilter('all')
  }

  // Base: my cases for SP, all for managers
  const baseClients = useMemo(() => {
    if (!canSeeAll) return clients.filter(c => c.assigned_to === currentUserId)
    if (activePlannerId) return clients.filter(c => c.assigned_to === activePlannerId)
    return clients
  }, [clients, canSeeAll, currentUserId, activePlannerId])

  const stats = useMemo(() => ({
    total: baseClients.length,
    overdue: baseClients.filter(isOverdue).length,
    dueThisWeek: baseClients.filter(isDueThisWeek).length,
    eligibilitySoon: baseClients.filter(isEligibilityEndingSoon).length,
    noContact: baseClients.filter(c => {
      const d = getDaysSinceContact(c.last_contact_date)
      return d !== null && d >= 7
    }).length,
  }), [baseClients])

  const filtered = useMemo(() => {
    let result = baseClients

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.client_id.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        (c.first_name?.toLowerCase().includes(q) ?? false) ||
        (c.eligibility_code?.toLowerCase().includes(q) ?? false)
      )
    }

    const activeFilter = alertFilter ?? filter
    switch (activeFilter) {
      case 'overdue': result = result.filter(isOverdue); break
      case 'due_this_week': result = result.filter(isDueThisWeek); break
      case 'no_contact_7': result = result.filter(c => {
        const d = getDaysSinceContact(c.last_contact_date)
        return d !== null && d >= 7
      }); break
      case 'eligibility_ending_soon': result = result.filter(isEligibilityEndingSoon); break
      case 'co': result = result.filter(c => c.category === 'co'); break
      case 'cfc': result = result.filter(c => c.category === 'cfc'); break
      case 'cpas': result = result.filter(c => c.category === 'cpas'); break
    }
    return result
  }, [baseClients, search, filter, alertFilter])

  const handleContactLogged = useCallback(async (clientId: string, date: string, type: string, note: string) => {
    const supabase = createClient()
    await supabase.from('clients').update({
      last_contact_date: date,
      last_contact_type: type,
    }).eq('id', clientId)

    if (note) {
      await supabase.from('activity_log').insert({
        client_id: clientId,
        user_id: currentUserId,
        action: `Logged contact: ${type}${note ? ' — ' + note : ''}`,
        field_name: 'last_contact_date',
        old_value: null,
        new_value: date,
      })
    }

    setClients(prev => prev.map(c => c.id === clientId
      ? { ...c, last_contact_date: date, last_contact_type: type }
      : c
    ))
  }, [currentUserId])

  async function handleBulkAssign() {
    if (!bulkAssignId || selectedIds.length === 0) return
    setBulkAssigning(true)
    const supabase = createClient()
    await supabase.from('clients').update({ assigned_to: bulkAssignId }).in('id', selectedIds)
    const planner = planners.find(p => p.id === bulkAssignId)
    setClients(prev => prev.map(c =>
      selectedIds.includes(c.id)
        ? { ...c, assigned_to: bulkAssignId, profiles: planner ?? c.profiles }
        : c
    ))
    setSelectedIds([])
    setBulkAssigning(false)
    setShowSelect(false)
  }

  const selectAll = () => setSelectedIds(filtered.map(c => c.id))
  const clearSelect = () => { setSelectedIds([]); setShowSelect(false) }

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Alert banner */}
      <AlertBanner
        overdue={stats.overdue}
        dueThisWeek={stats.dueThisWeek}
        eligibilitySoon={stats.eligibilitySoon}
        activeAlert={alertFilter}
        onAlert={handleAlertClick}
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 24 }}>
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Overdue" value={stats.overdue} color="var(--red)" onClick={() => handleAlertClick(alertFilter === 'overdue' ? null : 'overdue')} active={alertFilter === 'overdue'} />
        <StatCard label="Due This Week" value={stats.dueThisWeek} color="var(--orange)" onClick={() => handleAlertClick(alertFilter === 'due_this_week' ? null : 'due_this_week')} active={alertFilter === 'due_this_week'} />
        <StatCard label="No Contact 7+" value={stats.noContact} color="var(--yellow)" />
      </div>

      {/* Pinned */}
      <PinnedClients clients={clients} pinnedIds={pinnedIds} onUnpin={togglePin} />

      {/* Toolbar: export, bulk select */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          className="btn-secondary"
          style={{ fontSize: 12, minHeight: 36 }}
          onClick={() => exportToCsv(filtered)}
        >
          📥 Export CSV
        </button>
        <button
          className="btn-secondary"
          style={{ fontSize: 12, minHeight: 36, borderColor: showSelect ? 'var(--accent)' : undefined }}
          onClick={() => {
            setShowSelect(s => !s)
            if (showSelect) clearSelect()
          }}
        >
          ☑️ {showSelect ? 'Cancel Select' : 'Select'}
        </button>
        {showSelect && (
          <>
            <button className="btn-secondary" style={{ fontSize: 12, minHeight: 36 }} onClick={selectAll}>Select All ({filtered.length})</button>
            {selectedIds.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{selectedIds.length} selected</span>
            )}
          </>
        )}
        {showSelect && selectedIds.length > 0 && (
          <>
            <button
              className="btn-secondary"
              style={{ fontSize: 12, minHeight: 36 }}
              onClick={() => exportToCsv(clients.filter(c => selectedIds.includes(c.id)))}
            >
              📥 Export Selected
            </button>
            {canSeeAll && planners.length > 0 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select value={bulkAssignId} onChange={e => setBulkAssignId(e.target.value)} style={{ fontSize: 12 }}>
                  <option value="">Assign to planner…</option>
                  {planners.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
                <button
                  className="btn-primary"
                  style={{ fontSize: 12, minHeight: 36 }}
                  disabled={!bulkAssignId || bulkAssigning}
                  onClick={handleBulkAssign}
                >
                  {bulkAssigning ? 'Assigning…' : 'Assign'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Filters */}
      <FilterBar
        activeFilter={filter}
        search={search}
        onFilterChange={f => { setFilter(f); setAlertFilter(null) }}
        onSearchChange={setSearch}
        planners={canSeeAll ? planners : undefined}
        activePlannerId={activePlannerId}
        onPlannerChange={canSeeAll ? setActivePlannerId : undefined}
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
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        showSelect={showSelect}
        sortField={sortField}
        sortDir={sortDir}
        onSortChange={handleSortChange}
        onContactLogged={handleContactLogged}
      />
    </div>
  )
}

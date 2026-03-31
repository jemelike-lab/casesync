'use client'

import { useState, useRef, useEffect } from 'react'
import { ELIGIBILITY_CODES, getEligibilityDescription } from '@/lib/eligibility-codes'

interface Props {
  value: string | null | undefined
  onChange: (code: string | null) => void
  editing: boolean
}

export default function EligibilityCodeSelect({ value, onChange, editing }: Props) {
  const [query, setQuery] = useState(value ?? '')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync query when value changes externally
  useEffect(() => {
    setQuery(value ?? '')
  }, [value])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        // Reset query to selected value on blur
        setQuery(value ?? '')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [value])

  const filtered = ELIGIBILITY_CODES.filter(ec => {
    const q = query.toLowerCase()
    return ec.code.toLowerCase().includes(q) || ec.description.toLowerCase().includes(q)
  })

  const selectedDescription = value ? getEligibilityDescription(value) : ''

  if (!editing) {
    if (!value) return null
    return (
      <div>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#f5f5f7' }}>{value}</span>
        {selectedDescription && (
          <div style={{ fontSize: 11, color: '#98989d', marginTop: 2 }}>{selectedDescription}</div>
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          setOpen(true)
          if (!e.target.value) onChange(null)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search code or description…"
        style={{
          background: '#1c1c1e',
          border: '1px solid #333336',
          borderRadius: 6,
          color: '#f5f5f7',
          padding: '6px 10px',
          fontSize: 13,
          width: '100%',
          boxSizing: 'border-box',
          outline: 'none',
        }}
        autoComplete="off"
      />
      {value && selectedDescription && !open && (
        <div style={{ fontSize: 11, color: '#98989d', marginTop: 3 }}>{selectedDescription}</div>
      )}
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 9999,
          background: '#2c2c2e',
          border: '1px solid #444446',
          borderRadius: 8,
          marginTop: 4,
          maxHeight: 260,
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {filtered.map(ec => (
            <div
              key={ec.code}
              onMouseDown={e => {
                e.preventDefault()
                onChange(ec.code)
                setQuery(ec.code)
                setOpen(false)
              }}
              style={{
                padding: '9px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid #3a3a3c',
                background: ec.code === value ? 'rgba(0,122,255,0.15)' : 'transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,122,255,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.background = ec.code === value ? 'rgba(0,122,255,0.15)' : 'transparent')}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f5f5f7' }}>{ec.code}</div>
              <div style={{ fontSize: 11, color: '#98989d', marginTop: 2, lineHeight: 1.4 }}>{ec.description}</div>
            </div>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 9999,
          background: '#2c2c2e',
          border: '1px solid #444446',
          borderRadius: 8,
          marginTop: 4,
          padding: '12px',
          fontSize: 12,
          color: '#98989d',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          No matching codes found
        </div>
      )}
    </div>
  )
}

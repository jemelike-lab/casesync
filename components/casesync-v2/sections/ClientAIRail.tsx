'use client'

import { useState } from 'react'
import { Brain, X } from 'lucide-react'
import AIIntelligencePanel from '@/components/AIIntelligencePanel'

// ---------------------------------------------------------------------------
// ClientAIRail — Phase A Batch 3d
//
// Responsive AI Intelligence surface (reuses AIIntelligencePanel):
//   - >= 1024px: sticky right rail. The wrapper places this component in the
//     second column of .cs-detail-grid; .cs-ai-root sticks as the main column
//     scrolls.
//   - < 1024px:  a floating button stacked just above the BLH Bot launcher
//     (which sits at bottom:148 / calc(230px) on mobile), opening a popover.
//
// The grid + breakpoint CSS lives here (global <style>) so the wrapper edit
// stays minimal. Only rendered in the v2 (non-editing) view.
// ---------------------------------------------------------------------------

export default function ClientAIRail({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false)

  const cardStyle = {
    background: 'var(--v2-surface)',
    border: '1px solid rgba(191,90,242,0.18)',
    borderRadius: 14,
    padding: '14px 16px',
  } as const

  return (
    <div className="cs-ai-root">
      <div className="cs-ai-rail">
        <div style={cardStyle}>
          <AIIntelligencePanel clientId={clientId} />
        </div>
      </div>

      <div className="cs-ai-fabwrap">
        {open && (
          <div className="cs-ai-popover" style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--v2-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Client AI</span>
              <button aria-label="Close" onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--v2-text-muted)', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
            </div>
            <AIIntelligencePanel clientId={clientId} />
          </div>
        )}
        <button aria-label="AI intelligence for this client" onClick={() => setOpen(o => !o)} className="cs-ai-fab">
          <Brain size={22} color="#fff" />
        </button>
      </div>

      <style>{`
        .cs-detail-grid { display: grid; grid-template-columns: 1fr; gap: 0; }
        .cs-ai-root { display: block; }
        .cs-ai-rail { display: none; }
        .cs-ai-fabwrap { display: block; }
        .cs-ai-fab {
          position: fixed; right: 20px; bottom: 212px; z-index: 590;
          width: 48px; height: 48px; border-radius: 50%;
          background: #bf5af2; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 16px rgba(191,90,242,0.45);
        }
        .cs-ai-popover {
          position: fixed; right: 20px; bottom: 270px; z-index: 590;
          width: 340px; max-width: calc(100vw - 40px); max-height: 70vh; overflow: auto;
          box-shadow: 0 16px 48px rgba(0,0,0,0.28);
        }
        @media (max-width: 768px) {
          .cs-ai-fab { bottom: calc(294px + env(safe-area-inset-bottom)); }
          .cs-ai-popover { bottom: calc(352px + env(safe-area-inset-bottom)); }
        }
        @media (min-width: 1024px) {
          .cs-detail-grid { grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
          .cs-ai-root { position: sticky; top: 16px; }
          .cs-ai-rail { display: block; }
          .cs-ai-fabwrap { display: none; }
        }
      `}</style>
    </div>
  )
}

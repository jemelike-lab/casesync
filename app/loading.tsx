import LottieBlock from '@/components/ui/LottieBlock'
import { ANIM } from '@/lib/animations'

export default function RootLoading() {
  return (
    <div style={{ minHeight: '55vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <LottieBlock src={ANIM.loader} size={72} trigger="loop" label="Loading" />
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</div>
    </div>
  )
}

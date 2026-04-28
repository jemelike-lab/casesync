'use client'
import { useEffect } from 'react'
export default function WorkrynError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[Workryn Error]', error) }, [error])
  return (
    <div style={{ minHeight:'60vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:32,textAlign:'center',color:'#f1f5f9' }}>
      <div style={{ fontSize:48,marginBottom:16 }}>&#x26A0;&#xFE0F;</div>
      <h2 style={{ fontSize:20,fontWeight:700,marginBottom:8 }}>Something went wrong</h2>
      <p style={{ color:'#94a3b8',maxWidth:400,marginBottom:24,fontSize:14,lineHeight:1.6 }}>We hit an unexpected error. This has been logged.</p>
      <button onClick={reset} style={{ background:'#2563eb',color:'white',border:'none',padding:'10px 24px',borderRadius:8,fontSize:14,fontWeight:600,cursor:'pointer' }}>Try again</button>
    </div>
  )
}

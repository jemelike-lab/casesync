import Link from 'next/link'
export default function WorkrynNotFound() {
  return (
    <div style={{ minHeight:'60vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:32,textAlign:'center',color:'#f1f5f9' }}>
      <h2 style={{ fontSize:20,fontWeight:700,marginBottom:8 }}>Page not found</h2>
      <p style={{ color:'#94a3b8',maxWidth:400,marginBottom:24,fontSize:14 }}>The page you are looking for does not exist.</p>
      <Link href="/w/dashboard" style={{ background:'#2563eb',color:'white',padding:'10px 24px',borderRadius:8,fontSize:14,fontWeight:600,textDecoration:'none' }}>Back to Dashboard</Link>
    </div>
  )
}

export default function WorkrynLoading() {
  return (
    <div style={{ padding:'32px 0' }}>
      <div style={{ display:'flex',alignItems:'center',gap:16,marginBottom:32 }}>
        <div style={{ width:48,height:48,borderRadius:12,background:'rgba(255,255,255,0.06)',animation:'pulse 1.8s ease-in-out infinite' }} />
        <div>
          <div style={{ width:200,height:22,borderRadius:6,background:'rgba(255,255,255,0.06)',marginBottom:8,animation:'pulse 1.8s ease-in-out infinite' }} />
          <div style={{ width:280,height:14,borderRadius:6,background:'rgba(255,255,255,0.04)',animation:'pulse 1.8s ease-in-out infinite',animationDelay:'200ms' }} />
        </div>
      </div>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:16,marginBottom:28 }}>
        {[0,1,2,3].map(i => (<div key={i} style={{ background:'rgba(255,255,255,0.035)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:16,padding:20,height:88,animation:'pulse 1.8s ease-in-out infinite',animationDelay:`${i*100}ms` }} />))}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}

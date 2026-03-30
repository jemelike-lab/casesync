export default function OfflinePage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f0f11',
      color: '#f5f5f7',
      fontFamily: 'system-ui, sans-serif',
      textAlign: 'center',
      padding: 24,
    }}>
      <div style={{ fontSize: 64, marginBottom: 24 }}>📡</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 12px' }}>You&apos;re offline</h1>
      <p style={{ color: '#8e8e93', maxWidth: 320 }}>
        Please check your internet connection and try again.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 24,
          background: '#007aff',
          color: 'white',
          border: 'none',
          padding: '12px 24px',
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Try Again
      </button>
    </div>
  )
}

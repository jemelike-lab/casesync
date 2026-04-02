'use client'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        marginBottom: 20,
        padding: '8px 16px',
        background: '#007aff',
        color: 'white',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 14,
      }}
    >
      🖨️ Print
    </button>
  )
}

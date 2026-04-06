export const metadata = {
  title: 'Security | CaseSync',
  description: 'How CaseSync protects your data and maintains compliance.',
}

export default function SecurityPage() {
  return (
    <div style={{
      minHeight: '100dvh',
      background: '#0a0a0a',
      color: '#e5e5e5',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: '60px 24px',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <p style={{ color: '#6b7280', fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            Beatrice Loving Heart
          </p>
          <h1 style={{ fontSize: 36, fontWeight: 700, margin: '0 0 16px 0', color: '#fff' }}>
            Security at CaseSync
          </h1>
          <p style={{ color: '#9ca3af', fontSize: 16, lineHeight: 1.6, margin: 0 }}>
            We take the security and privacy of patient and staff data seriously.
            Here&apos;s how we protect what matters.
          </p>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: '#1f2937', marginBottom: 48 }} />

        {/* Security Features */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>

          <Section
            icon="🔒"
            title="Encryption at Rest & in Transit"
            body="All data is encrypted at rest using AES-256. All data in transit is protected with TLS 1.3. Database credentials and secrets are never stored in code — only in environment variables managed by Vercel."
          />

          <Section
            icon="🏥"
            title="HIPAA Compliance"
            body="CaseSync is built for healthcare environments. We follow HIPAA's technical safeguards including access controls, audit logs, and automatic session timeouts. Patient information is only accessible to authorized personnel."
          />

          <Section
            icon="🛡️"
            title="Two-Factor Authentication"
            body="Supervisor accounts can enable two-factor authentication via Supabase Auth. We recommend all administrative users enable 2FA to prevent unauthorized access even if credentials are compromised."
          />

          <Section
            icon="📋"
            title="Audit Logs"
            body="CaseSync maintains audit logs of key actions including login events, document uploads, and case status changes. Logs are stored securely and accessible to authorized supervisors."
          />

          <Section
            icon="🤝"
            title="Microsoft Business Associate Agreement (BAA)"
            body="We operate under a Microsoft Business Associate Agreement for SharePoint and OneDrive integrations used to store and manage case documents. This ensures Microsoft's compliance obligations under HIPAA."
          />

          <Section
            icon="🔑"
            title="Access Controls"
            body="Role-based access control (RBAC) ensures staff only see data relevant to their role. Supervisors have elevated access for management tasks. All sessions are validated server-side on every request."
          />

          <Section
            icon="🔄"
            title="Dependency Security"
            body="We use automated Dependabot security updates to keep all dependencies patched. Pull requests for security updates are reviewed and merged promptly."
          />

        </div>

        {/* Divider */}
        <div style={{ height: 1, background: '#1f2937', margin: '48px 0' }} />

        {/* Report a vulnerability */}
        <div style={{
          background: '#111827',
          border: '1px solid #1f2937',
          borderRadius: 12,
          padding: '28px 32px',
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 12px 0', color: '#fff' }}>
            Report a Security Issue
          </h2>
          <p style={{ color: '#9ca3af', fontSize: 15, lineHeight: 1.6, margin: '0 0 16px 0' }}>
            If you&apos;ve discovered a security vulnerability in CaseSync, please disclose it
            responsibly. Do not post publicly — contact us directly.
          </p>
          <a
            href="mailto:security@blhnurses.com"
            style={{
              display: 'inline-block',
              background: '#1d4ed8',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            security@blhnurses.com
          </a>
        </div>

        {/* Footer */}
        <p style={{ color: '#4b5563', fontSize: 12, marginTop: 48, textAlign: 'center' }}>
          Last updated: March 2026 · Beatrice Loving Heart, Inc.
        </p>
      </div>
    </div>
  )
}

function Section({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div style={{ display: 'flex', gap: 20 }}>
      <div style={{ fontSize: 28, flexShrink: 0, marginTop: 2 }}>{icon}</div>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px 0', color: '#f3f4f6' }}>
          {title}
        </h2>
        <p style={{ color: '#9ca3af', fontSize: 15, lineHeight: 1.7, margin: 0 }}>{body}</p>
      </div>
    </div>
  )
}

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import InstallBanner from '@/components/InstallBanner'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'CaseSync',
  description: 'Case Management Portal',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#007aff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="CaseSync" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={inter.className} style={{ background: '#0f0f11', color: '#f5f5f7', minHeight: '100vh' }}>
        {children}
        <InstallBanner />
      </body>
    </html>
  )
}

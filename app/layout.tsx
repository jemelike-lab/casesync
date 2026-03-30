import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

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
      <body className={inter.className} style={{ background: '#0f0f11', color: '#f5f5f7', minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  )
}

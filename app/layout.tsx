import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import './workryn.css'
import './workryn-timeclock.css'
import './workryn-schedule.css'
import './workryn-tickets.css'
import './workryn-light-mode.css'
import InstallBanner from '@/components/InstallBanner'
import SessionGuard from '@/components/SessionGuard'
import { ThemeProvider } from '@/components/workryn/ThemeProvider'
import { Analytics } from '@vercel/analytics/next'
import YourCaseAI from '@/components/YourCaseAI'
import FeedbackTab from '@/components/FeedbackTab'

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans', display: 'swap' })

export const metadata: Metadata = {
  title: 'CaseSync',
  description: 'Case Management Portal — Designed and developed by VELOX Automated Operations',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={geistSans.variable}>
      <head>
        {/*
          Early theme-init: runs synchronously before any paint so the
          stored theme is applied before React hydrates. Without this,
          the page renders with the dark defaults from globals.css and
          the body inline style — even when localStorage says "light" —
          and may stay that way on routes that don't re-mount ThemeProvider.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||localStorage.getItem('workryn-theme');if(t==='system'||!t){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}if(t!=='light'&&t!=='dark')t='dark';document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`,
          }}
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0f0f11" />
        <meta name="author" content="VELOX Automated Operations LLC" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="CaseSync" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="CaseSync" />
        <meta name="msapplication-TileColor" content="#2563eb" />
        <meta name="msapplication-TileImage" content="/icons/icon-144x144.png" />
        {/* Apple splash screens */}
        <link rel="apple-touch-startup-image" href="/splash/splash-iphone-14-pro.png" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-iphone-14-max.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-iphone-16-pro.png" media="(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-iphone-16-pro-max.png" media="(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-iphone-12.png" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-iphone-12-max.png" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-iphone-x.png" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-iphone-xr.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-iphone-xs-max.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-iphone-8.png" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-ipad-pro-11.png" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-ipad-pro-12.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)" />
      </head>
      <body className={geistSans.className} style={{ minHeight: '100dvh' }}>
        <ThemeProvider>
          {children}
          {/* SessionGuard: mounts IdleTimeout for all authenticated routes */}
          <SessionGuard />
          <InstallBanner />
          <Analytics />
          <YourCaseAI />
          {/* Tester feedback / issue reporting — edge tab, CaseSync routes only (hidden on /w/*) */}
          <FeedbackTab />
        </ThemeProvider>
      <script dangerouslySetInnerHTML={{__html: "if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{})});}"}} />
      </body>
    </html>
  )
}

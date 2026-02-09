import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import SiteNav from '@/components/site-nav'

import './globals.css'

const _geist = Geist({ subsets: ['latin'] })
const _geistMono = Geist_Mono({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Build Log · Experiments & Notes',
  description: 'A living log of experiments, ideas, and technical notes from building in the Solana ecosystem.',
  icons: {
    icon: '/favicon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <SiteNav />
        <div className="min-h-[calc(100vh-56px)] pb-20 md:pb-0">{children}</div>
      </body>
    </html>
  )
}

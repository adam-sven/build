import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import TrencherNav from '@/components/trencher-nav'
import SolanaWalletProvider from '@/components/wallet/solana-wallet-provider'

import './globals.css'

const _geist = Geist({ subsets: ['latin'] })
const _geistMono = Geist_Mono({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Trencher',
  description: 'Explainable token discovery. No pay-to-boost.',
  icons: {
    icon: '/trencher-mark.svg',
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
        <SolanaWalletProvider>
          <TrencherNav />
          <div className="min-h-[calc(100vh-56px)] bg-[radial-gradient(1200px_600px_at_10%_-20%,#0d1f34_0%,transparent_55%),radial-gradient(900px_500px_at_90%_-10%,#06251c_0%,transparent_55%),#04060a] text-white">
            {children}
          </div>
          <footer className="border-t border-white/10 bg-black/70 px-4 py-4 text-xs text-white/60">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-2">
              <p>Trencher is a filter for attention, not a predictor. Not financial advice.</p>
              <p>
                Voting requires 0.001 SOL anti-spam fee to public treasury.{" "}
                <a
                  className="text-emerald-300 hover:text-emerald-200"
                  href="https://solscan.io/account/CSJc1VcNJUHJHj199sVSa8XJ66rvEpf4sHbpeQj7N6vA"
                  target="_blank"
                  rel="noreferrer"
                >
                  View treasury
                </a>
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a
                  className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-emerald-200 hover:border-emerald-300/60 hover:text-emerald-100"
                  href="https://gmgn.ai/r/l6KmuuAJ"
                  target="_blank"
                  rel="noreferrer nofollow noopener"
                >
                  Trade on GMGN
                </a>
                <a
                  className="rounded-md border border-cyan-400/40 bg-cyan-400/10 px-2 py-1 text-cyan-200 hover:border-cyan-300/60 hover:text-cyan-100"
                  href="https://fomo.family/r/Adam_Sven_"
                  target="_blank"
                  rel="noreferrer nofollow noopener"
                >
                  Trade on FOMO
                </a>
              </div>
            </div>
          </footer>
        </SolanaWalletProvider>
      </body>
    </html>
  )
}

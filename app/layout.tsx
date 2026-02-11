import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import TrencherNav from '@/components/trencher-nav'
import TrencherGlobalSearch from "@/components/trencher-global-search";
import SolanaWalletProvider from '@/components/wallet/solana-wallet-provider'
import ConnectButton from '@/components/wallet/connect-button'
import LiveStatusBadge from "@/components/trencher/live-status-badge";
import "@solana/wallet-adapter-react-ui/styles.css";

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
          <div className="trencher-shell min-h-screen bg-[radial-gradient(1200px_600px_at_10%_-20%,#0d1f34_0%,transparent_55%),radial-gradient(900px_500px_at_90%_-10%,#06251c_0%,transparent_55%),#04060a] text-white md:pl-56">
            <div className="border-b border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-center text-xs font-medium text-emerald-200 md:px-6">
              Ranking is driven by community votes, search interest, and market quality - not payments.
            </div>
            <div className="border-b border-white/10 bg-black/25">
              <div className="hidden w-full justify-end px-3 pt-2 md:flex md:px-6">
                <div className="flex items-center gap-2">
                  <ConnectButton />
                </div>
              </div>
              <TrencherGlobalSearch />
            </div>
            {children}
          </div>
          <LiveStatusBadge />
          <footer className="border-t border-white/10 bg-black/70 px-3 py-4 text-xs text-white/60 md:pl-60 md:pr-6">
            <div className="flex w-full flex-col gap-2">
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
              <p>
                Created by{" "}
                <a
                  className="text-emerald-300 hover:text-emerald-200"
                  href="https://x.com/Adam_Sven_"
                  target="_blank"
                  rel="noreferrer nofollow noopener"
                >
                  @Adam_Sven_
                </a>
              </p>
            </div>
          </footer>
        </SolanaWalletProvider>
      </body>
    </html>
  )
}

"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { BarChart3, FileText, LayoutDashboard, Search, Shield, Wallet } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import ConnectButton from "@/components/wallet/connect-button";
import ThemeToggle from "@/components/theme-toggle";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/discover", label: "Discover", icon: Search },
  { href: "/smart", label: "Smart Wallets", icon: Wallet },
  { href: "/intel", label: "Intel", icon: BarChart3 },
  { href: "/submit", label: "Submit", icon: Shield },
  { href: "/api-docs", label: "API Docs", icon: FileText },
  { href: "/build-log", label: "Build Log", icon: FileText },
];

export default function TrencherNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/85 backdrop-blur-xl md:hidden">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3">
          <Link href="/dashboard" className="flex items-center gap-2 text-base font-semibold text-white">
            <Image src="/trencher-mark.svg" alt="Trencher" width={20} height={20} className="h-5 w-5" />
            <span>Trencher</span>
          </Link>
          <div className="flex items-center gap-2">
            <ConnectButton />
            <Button
              type="button"
              variant="outline"
              className="h-8 border-white/20 px-2 text-xs"
              onClick={() => setMobileOpen((v) => !v)}
            >
              Menu
            </Button>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)}>
          <aside
            className="h-full w-72 border-r border-white/10 bg-[#090d14] p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold text-white" onClick={() => setMobileOpen(false)}>
                <Image src="/trencher-mark.svg" alt="Trencher" width={18} height={18} className="h-[18px] w-[18px]" />
                Trencher
              </Link>
            </div>
            <nav className="space-y-1">
              {LINKS.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                      active
                        ? "bg-emerald-400 text-black"
                        : "text-white/75 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-4">
              <ThemeToggle compact />
            </div>
          </aside>
        </div>
      )}

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 border-r border-white/10 bg-[#090d14] md:block">
        <div className="flex h-full flex-col p-3">
          <Link href="/dashboard" className="mb-4 flex items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-white">
            <Image src="/trencher-mark.svg" alt="Trencher" width={18} height={18} className="h-[18px] w-[18px]" />
            Trencher
          </Link>
          <nav className="space-y-1">
            {LINKS.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                    active
                      ? "bg-emerald-400 text-black"
                      : "text-white/75 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto space-y-2">
            <ThemeToggle compact />
            <a
              href="https://gmgn.ai/r/l6KmuuAJ"
              target="_blank"
              rel="noreferrer nofollow noopener"
              className="block rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200 hover:border-emerald-300/60 hover:text-emerald-100"
            >
              Trade GMGN
            </a>
            <a
              href="https://fomo.family/r/Adam_Sven_"
              target="_blank"
              rel="noreferrer nofollow noopener"
              className="block rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-200 hover:border-cyan-300/60 hover:text-cyan-100"
            >
              Trade FOMO
            </a>
            <a
              href="https://trade.padre.gg/rk/trencherdex"
              target="_blank"
              rel="noreferrer nofollow noopener"
              className="block rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200 hover:border-amber-300/60 hover:text-amber-100"
            >
              Trade Padre
            </a>
            <a
              href="https://axiom.trade/@kingsven"
              target="_blank"
              rel="noreferrer nofollow noopener"
              className="block rounded-lg border border-violet-400/40 bg-violet-400/10 px-3 py-2 text-xs text-violet-200 hover:border-violet-300/60 hover:text-violet-100"
            >
              Trade Axiom
            </a>
          </div>
        </div>
      </aside>
    </>
  );
}

"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/wallet/connect-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/discover", label: "Discover" },
  { href: "/smart", label: "Smart Wallets" },
  { href: "/intel", label: "Intel" },
  { href: "/submit", label: "Submit" },
  { href: "/api-docs", label: "API Docs" },
  { href: "/build-log", label: "Build Log" },
];

export default function TrencherNav() {
  const pathname = usePathname();
  const primaryLinks = LINKS.slice(0, 4);
  const secondaryLinks = LINKS.slice(4);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/70 backdrop-blur-xl">
      <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center justify-between gap-3 px-3 py-2 sm:px-4">
        <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-white">
          <Image
            src="/trencher-mark.svg"
            alt="Trencher"
            width={22}
            height={22}
            className="h-[22px] w-[22px] rounded-sm"
          />
          <span>Trencher</span>
        </Link>
        <nav className="hidden min-w-0 items-center gap-1 sm:gap-2 md:flex">
          {LINKS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-2 py-1.5 text-xs sm:px-3 sm:text-sm ${
                  active ? "bg-emerald-400 text-black" : "text-white/70 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <a
            href="https://gmgn.ai/r/l6KmuuAJ"
            target="_blank"
            rel="noreferrer nofollow noopener"
            className="hidden rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-2 py-1.5 text-xs text-emerald-200 hover:border-emerald-300/60 hover:text-emerald-100 md:inline-block"
          >
            Trade GMGN
          </a>
          <a
            href="https://fomo.family/r/Adam_Sven_"
            target="_blank"
            rel="noreferrer nofollow noopener"
            className="hidden rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-2 py-1.5 text-xs text-cyan-200 hover:border-cyan-300/60 hover:text-cyan-100 md:inline-block"
          >
            Trade FOMO
          </a>
          <div className="ml-2 hidden sm:block">
            <ConnectButton />
          </div>
        </nav>
        <div className="flex items-center gap-2 md:hidden">
          <div className="flex max-w-[62vw] items-center gap-1 overflow-x-auto">
            {primaryLinks.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 rounded-md px-2 py-1 text-xs ${
                    active ? "bg-emerald-400 text-black" : "border border-white/10 text-white/75"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 border-white/20 px-2 text-xs">Menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-white/10 bg-black/95 text-white">
              {secondaryLinks.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href}>{item.label}</Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem asChild>
                <a href="https://gmgn.ai/r/l6KmuuAJ" target="_blank" rel="noreferrer nofollow noopener">Trade GMGN</a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="https://fomo.family/r/Adam_Sven_" target="_blank" rel="noreferrer nofollow noopener">Trade FOMO</a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

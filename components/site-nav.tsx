"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Build Log" },
  { href: "/scan", label: "Scan" },
  { href: "/intel", label: "Intel" },
  { href: "/smart", label: "Smart Wallets" },
];

export default function SiteNav() {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-40 hidden border-b border-white/10 bg-black/65 backdrop-blur-xl md:block">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4">
          <nav className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-emerald-400 text-black"
                      : "border border-white/10 bg-white/5 text-white/70 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-black/80 px-2 pb-2 pt-2 backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-6xl grid-cols-4 gap-2">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/"
                ? pathname === item.href
                : pathname.startsWith(item.href);
            const mobileLabel =
              item.label === "Build Log"
                ? "Home"
                : item.label === "Smart Wallets"
                  ? "Smart"
                  : item.label;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-2 py-2 text-center text-xs font-medium transition-colors ${
                  active
                    ? "bg-emerald-400 text-black"
                    : "border border-white/10 bg-white/5 text-white/70"
                }`}
              >
                {mobileLabel}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

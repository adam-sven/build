"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import ConnectButton from "@/components/wallet/connect-button";

export default function TrencherGlobalSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const showSearch = pathname !== "/";

  const runSearch = async () => {
    const value = q.trim();
    if (!value || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ui/search/resolve?q=${encodeURIComponent(value)}`);
      const json = await res.json();
      const url = json?.target?.url || "/discover";
      router.push(url);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full px-3 py-2 md:px-6">
      <div className="flex w-full items-center gap-2">
        {showSearch && (
          <>
            <div className="relative w-full md:max-w-2xl">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/45" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch();
                }}
                placeholder="Search token (mint/symbol/name) or wallet (address/name)"
                className="h-9 w-full rounded-lg border border-white/10 bg-black/45 pl-7 pr-2 text-xs text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/30"
              />
            </div>
            <button
              type="button"
              onClick={runSearch}
              className="h-9 rounded-lg bg-emerald-400 px-3 text-xs font-medium text-black hover:opacity-90 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "..." : "Search"}
            </button>
          </>
        )}
        <div className="ml-auto hidden md:block">
          <ConnectButton />
        </div>
      </div>
    </div>
  );
}

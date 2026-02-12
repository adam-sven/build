"use client";

import { useEffect, useState } from "react";

const HIDE_KEY = "trencher:banner:ranking:hidden:v1";

export default function TrencherRankingBanner() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(HIDE_KEY) === "1") {
        setHidden(true);
      }
    } catch {
      // ignore storage failures
    }
  }, []);

  if (hidden) return null;

  return (
    <div className="relative border-b border-emerald-400/20 bg-emerald-500/10 px-10 py-2 text-center text-xs font-medium text-emerald-200 md:px-12">
      Ranking is driven by community votes, search interest, and market quality - not payments.
      <button
        type="button"
        aria-label="Dismiss ranking banner"
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-white/20 px-1.5 py-0.5 text-[10px] text-white/75 hover:bg-white/10 hover:text-white"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(HIDE_KEY, "1");
          } catch {
            // ignore storage failures
          }
        }}
      >
        X
      </button>
    </div>
  );
}

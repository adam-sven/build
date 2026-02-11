"use client";

import { useEffect, useMemo, useState } from "react";

type LiveStatus = {
  ok: boolean;
  serverTime: number;
  updatedAt: number;
  smartAt: number;
  discoverAt: number;
};

function formatAgo(ms: number) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h`;
}

export default function LiveStatusBadge() {
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [status, setStatus] = useState<LiveStatus | null>(null);

  useEffect(() => {
    let dead = false;

    const load = async () => {
      const t0 = performance.now();
      try {
        const res = await fetch("/api/ui/live-status", { cache: "no-store" });
        const t1 = performance.now();
        if (!res.ok) return;
        const json: LiveStatus = await res.json();
        if (dead) return;
        setLatencyMs(Math.max(1, Math.round(t1 - t0)));
        setStatus(json);
      } catch {
        // ignore
      }
    };

    void load();
    const timer = setInterval(load, 12_000);
    return () => {
      dead = true;
      clearInterval(timer);
    };
  }, []);

  const derived = useMemo(() => {
    const now = Date.now();
    const updatedAt = status?.updatedAt || 0;
    const staleMs = updatedAt ? now - updatedAt : Number.POSITIVE_INFINITY;
    const level =
      staleMs < 90_000 ? "stable" :
      staleMs < 5 * 60_000 ? "warming" :
      "stale";
    return { staleMs, level };
  }, [status]);

  const tone =
    derived.level === "stable"
      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
      : derived.level === "warming"
        ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
        : "border-red-400/40 bg-red-500/15 text-red-200";

  const label =
    derived.level === "stable"
      ? "Stable"
      : derived.level === "warming"
        ? "Warming"
        : "Stale";

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-[85] md:bottom-4 md:right-4">
      <div className={`rounded-lg border px-3 py-1.5 text-xs font-medium shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur ${tone}`}>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-current opacity-90" />
          <span>{label}</span>
          <span>{latencyMs ? `${latencyMs}ms` : "--ms"}</span>
          <span>updated {formatAgo(derived.staleMs)}</span>
        </span>
      </div>
    </div>
  );
}

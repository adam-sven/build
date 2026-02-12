"use client";

import { useEffect, useMemo, useState } from "react";

type LiveStatus = {
  ok: boolean;
  serverTime: number;
  updatedAt: number;
  smartAt: number;
  discoverAt: number;
};
const LIVE_STATUS_POLL_MS = Math.max(15_000, Number(process.env.NEXT_PUBLIC_LIVE_STATUS_POLL_MS || "30000"));

function formatAgo(ms: number) {
  if (!Number.isFinite(ms)) return "--";
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
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    let dead = false;

    const load = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const t0 = performance.now();
      try {
        const res = await fetch("/api/ui/live-status", { cache: "no-store" });
        const t1 = performance.now();
        if (!res.ok) return;
        const json: LiveStatus = await res.json();
        if (dead) return;
        setLatencyMs(Math.max(1, Math.round(t1 - t0)));
        setStatus(json);
        const now = Date.now();
        const ageSec = json.updatedAt ? Math.max(0, Math.floor((now - json.updatedAt) / 1000)) : -1;
        const smartSec = json.smartAt ? Math.max(0, Math.floor((now - json.smartAt) / 1000)) : -1;
        const discoverSec = json.discoverAt ? Math.max(0, Math.floor((now - json.discoverAt) / 1000)) : -1;
        const stamp = new Date(now).toLocaleTimeString();
        const row = `[${stamp}] ping=${Math.max(1, Math.round(t1 - t0))}ms updated=${ageSec >= 0 ? `${ageSec}s` : "na"} smart=${smartSec >= 0 ? `${smartSec}s` : "na"} discover=${discoverSec >= 0 ? `${discoverSec}s` : "na"}`;
        setLines((prev) => [...prev.slice(-13), row]);
      } catch {
        // ignore
      }
    };

    void load();
    const timer = setInterval(load, LIVE_STATUS_POLL_MS);
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
  const ageLabel = Number.isFinite(derived.staleMs)
    ? `updated ${formatAgo(derived.staleMs)}`
    : "no data yet";

  return (
    <div className="fixed bottom-3 right-3 z-[85] md:bottom-4 md:right-4">
      {open && (
        <div className="mb-2 w-[min(92vw,560px)] overflow-hidden rounded-lg border border-emerald-400/20 bg-black/85 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[11px] text-white/70">
            <span className="font-mono">iamtrader/live-terminal</span>
            <button
              type="button"
              className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/70 hover:text-white"
              onClick={() => setOpen(false)}
            >
              close
            </button>
          </div>
          <div className="max-h-44 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-5 text-emerald-200/90">
            {(lines.length ? lines : ["[boot] waiting for first status tick..."]).map((line, i) => (
              <div key={`${line}-${i}`}>{line}</div>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-lg border px-3 py-1.5 text-xs font-medium shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur ${tone}`}
      >
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-current opacity-90" />
          <span>{label}</span>
          <span>{latencyMs ? `${latencyMs}ms` : "--ms"}</span>
          <span>{ageLabel}</span>
          <span className="rounded border border-white/20 px-1.5 py-0.5 text-[10px] text-white/85">terminal</span>
        </span>
      </button>
    </div>
  );
}

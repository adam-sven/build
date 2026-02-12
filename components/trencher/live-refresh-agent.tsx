"use client";

import { useEffect } from "react";

const TICK_MS = Number(process.env.NEXT_PUBLIC_LIVE_TICK_MS || "30000");
const ENABLE_CLIENT_TICK = /^(1|true|yes)$/i.test(
  process.env.NEXT_PUBLIC_ENABLE_CLIENT_TICK || "",
);
const LEADER_KEY = "trencher:live-tick:leader";
const LEADER_TTL_MS = 45_000;

async function tick(scope: "all" | "smart" | "discover" = "all") {
  try {
    await fetch(`/api/live/tick?chain=solana&scope=${scope}`, {
      method: "GET",
      cache: "no-store",
      keepalive: true,
    });
  } catch {
    // ignore background tick failures
  }
}

export default function LiveRefreshAgent() {
  useEffect(() => {
    if (!ENABLE_CLIENT_TICK) return;
    let dead = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tabId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const becomeLeaderIfNeeded = () => {
      try {
        const now = Date.now();
        const raw = localStorage.getItem(LEADER_KEY);
        const parsed = raw ? (JSON.parse(raw) as { id: string; at: number }) : null;
        const stale = !parsed || now - Number(parsed.at || 0) > LEADER_TTL_MS;
        const same = parsed?.id === tabId;
        if (stale || same) {
          localStorage.setItem(LEADER_KEY, JSON.stringify({ id: tabId, at: now }));
          return true;
        }
        return false;
      } catch {
        return true;
      }
    };

    const isLeader = () => {
      try {
        const raw = localStorage.getItem(LEADER_KEY);
        if (!raw) return becomeLeaderIfNeeded();
        const parsed = JSON.parse(raw) as { id: string; at: number };
        if (parsed?.id === tabId) return becomeLeaderIfNeeded();
        return Date.now() - Number(parsed?.at || 0) > LEADER_TTL_MS ? becomeLeaderIfNeeded() : false;
      } catch {
        return true;
      }
    };

    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (dead || document.visibilityState !== "visible" || !isLeader()) return;
        void tick("all");
      }, Math.max(10_000, TICK_MS));
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (isLeader()) void tick("all");
      }
    };

    // Warm immediately after mount so first user interaction sees hot caches.
    if (isLeader()) void tick("all");
    start();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      dead = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}

"use client";

import { useEffect } from "react";

const TICK_MS = Number(process.env.NEXT_PUBLIC_LIVE_TICK_MS || "15000");

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
    let dead = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (dead || document.visibilityState !== "visible") return;
        void tick("all");
      }, Math.max(5_000, TICK_MS));
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void tick("all");
      }
    };

    // Warm immediately after mount so first user interaction sees hot caches.
    void tick("all");
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


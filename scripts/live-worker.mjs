/* eslint-disable no-console */
const APP_URL = process.env.LIVE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const LIVE_TICK_SECRET = process.env.LIVE_TICK_SECRET || "";
const CHAIN = process.env.LIVE_CHAIN || "solana";
const SCOPE = process.env.LIVE_SCOPE || "all";
const INTERVAL_MS = Number(process.env.LIVE_INTERVAL_MS || "12000");

if (!APP_URL) {
  console.error("Missing LIVE_APP_URL (or NEXT_PUBLIC_APP_URL)");
  process.exit(1);
}

function normalizeBaseUrl(url) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

const base = normalizeBaseUrl(APP_URL);
const target = `${base}/api/live/tick?chain=${encodeURIComponent(CHAIN)}&scope=${encodeURIComponent(SCOPE)}`;

async function tick() {
  const started = Date.now();
  try {
    const res = await fetch(target, {
      method: "GET",
      headers: LIVE_TICK_SECRET ? { Authorization: `Bearer ${LIVE_TICK_SECRET}` } : {},
      cache: "no-store",
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      const txt = await res.text();
      console.error(`[live-worker] ${new Date().toISOString()} status=${res.status} ${ms}ms body=${txt.slice(0, 200)}`);
      return;
    }
    const json = await res.json();
    console.log(`[live-worker] ${new Date().toISOString()} ok refreshed=${json?.refreshed} reason=${json?.reason} ${ms}ms`);
  } catch (error) {
    const ms = Date.now() - started;
    console.error(`[live-worker] ${new Date().toISOString()} error ${ms}ms`, error?.message || error);
  }
}

async function start() {
  console.log(`[live-worker] starting target=${target} interval=${INTERVAL_MS}ms`);
  await tick();
  setInterval(tick, INTERVAL_MS);
}

start();


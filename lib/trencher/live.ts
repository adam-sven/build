import { buildSmartWalletSnapshot } from "@/lib/smart-wallets";
import { kvDel, kvGet, kvSet, kvSetNx } from "@/lib/trencher/kv";
import { buildDiscoverFeed } from "@/lib/trencher/service";
import type { Chain, DiscoverMode } from "@/lib/trencher/types";

type LiveScope = "discover" | "smart" | "all";

const DISCOVER_REFRESH_MS: Record<DiscoverMode, number> = {
  trending: 12_000,
  voted: 25_000,
  new: 45_000,
  quality: 60_000,
};
const SMART_REFRESH_MS = Number(process.env.SMART_REFRESH_MS || "300000");
const LIVE_LOCK_KEY = "trencher:live:refresh:lock";

const DISCOVER_AT_KEY = (chain: Chain, mode: DiscoverMode) => `trencher:live:discover:at:${chain}:${mode}`;
const SMART_AT_KEY = "trencher:live:smart:at";

export async function runLiveRefresh(chain: Chain, scope: LiveScope = "all") {
  const now = Date.now();
  const modes: DiscoverMode[] = ["trending", "new", "voted", "quality"];
  const [modeAts, smartAt] = await Promise.all([
    Promise.all(modes.map((mode) => kvGet<number>(DISCOVER_AT_KEY(chain, mode)))),
    kvGet<number>(SMART_AT_KEY),
  ]);
  const discoverAtMap = Object.fromEntries(modes.map((mode, i) => [mode, modeAts[i] || 0])) as Record<
    DiscoverMode,
    number
  >;
  const discoverAts = Object.values(discoverAtMap);
  const discoverAt = discoverAts.length ? Math.min(...discoverAts.filter(Boolean)) || 0 : 0;

  const discoverModesToRefresh =
    scope === "all" || scope === "discover"
      ? modes.filter((mode) => {
          const ts = discoverAtMap[mode];
          return !ts || now - ts > DISCOVER_REFRESH_MS[mode];
        })
      : [];
  const needDiscover = discoverModesToRefresh.length > 0;
  const needSmart = (scope === "all" || scope === "smart") && (!smartAt || now - smartAt > SMART_REFRESH_MS);

  if (!needDiscover && !needSmart) {
    return { ok: true, refreshed: false, reason: "fresh", discoverAt, smartAt };
  }

  const lock = await kvSetNx(LIVE_LOCK_KEY, String(now), 25);
  if (!lock) {
    return { ok: true, refreshed: false, reason: "locked", discoverAt, smartAt };
  }

  try {
    if (needDiscover) {
      await Promise.all(
        discoverModesToRefresh.map(async (mode) => {
          await buildDiscoverFeed(chain, mode);
          await kvSet(DISCOVER_AT_KEY(chain, mode), Date.now(), 3600);
        }),
      );
    }

    if (needSmart) {
      await buildSmartWalletSnapshot(false);
      await kvSet(SMART_AT_KEY, Date.now(), 3600);
    }

    return { ok: true, refreshed: true, reason: "updated" };
  } finally {
    await kvDel(LIVE_LOCK_KEY);
  }
}

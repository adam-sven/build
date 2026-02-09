import { buildSmartWalletSnapshot } from "@/lib/smart-wallets";
import { kvDel, kvGet, kvSet, kvSetNx } from "@/lib/trencher/kv";
import { buildDiscoverFeed } from "@/lib/trencher/service";
import type { Chain, DiscoverMode } from "@/lib/trencher/types";

type LiveScope = "discover" | "smart" | "all";

const DISCOVER_REFRESH_MS = 15_000;
const SMART_REFRESH_MS = 45_000;
const LIVE_LOCK_KEY = "trencher:live:refresh:lock";

const DISCOVER_AT_KEY = (chain: Chain) => `trencher:live:discover:at:${chain}`;
const SMART_AT_KEY = "trencher:live:smart:at";

export async function runLiveRefresh(chain: Chain, scope: LiveScope = "all") {
  const now = Date.now();
  const [discoverAt, smartAt] = await Promise.all([
    kvGet<number>(DISCOVER_AT_KEY(chain)),
    kvGet<number>(SMART_AT_KEY),
  ]);

  const needDiscover =
    (scope === "all" || scope === "discover") &&
    (!discoverAt || now - discoverAt > DISCOVER_REFRESH_MS);
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
      const modes: DiscoverMode[] = ["trending", "new", "voted", "quality"];
      await Promise.all(modes.map((mode) => buildDiscoverFeed(chain, mode)));
      await kvSet(DISCOVER_AT_KEY(chain), Date.now(), 3600);
    }

    if (needSmart) {
      await buildSmartWalletSnapshot(true);
      await kvSet(SMART_AT_KEY, Date.now(), 3600);
    }

    return { ok: true, refreshed: true, reason: "updated" };
  } finally {
    await kvDel(LIVE_LOCK_KEY);
  }
}


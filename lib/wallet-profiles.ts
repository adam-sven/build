import fs from "fs";
import path from "path";

export type WalletProfile = {
  rank: number | null;
  wallet: string;
  name: string | null;
  accountUrl: string | null;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
};

type WalletProfilesFile = {
  entries?: Array<Record<string, unknown>>;
};

const DATA_PATH = path.join(process.cwd(), "data", "wallet-profiles.json");
const WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,50}$/;

let cache: { at: number; map: Map<string, WalletProfile> } | null = null;
const TTL_MS = 30_000;

function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) return null;
  return v;
}

function sanitizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  return v.slice(0, 64);
}

export function getWalletProfilesMap(): Map<string, WalletProfile> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;

  try {
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as WalletProfilesFile;
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    const map = new Map<string, WalletProfile>();

    for (const item of entries) {
      const wallet = String(item.wallet || "").trim();
      if (!WALLET_RE.test(wallet)) continue;
      const rankN = Number(item.rank);
      const profile: WalletProfile = {
        rank: Number.isFinite(rankN) ? rankN : null,
        wallet,
        name: sanitizeName(item.name),
        accountUrl: sanitizeUrl(item.accountUrl),
        twitter: sanitizeUrl(item.twitter),
        telegram: sanitizeUrl(item.telegram),
        website: sanitizeUrl(item.website),
      };
      map.set(wallet, profile);
    }

    cache = { at: Date.now(), map };
    return map;
  } catch {
    const empty = new Map<string, WalletProfile>();
    cache = { at: Date.now(), map: empty };
    return empty;
  }
}

export function getWalletProfile(wallet: string): WalletProfile | null {
  if (!wallet) return null;
  return getWalletProfilesMap().get(wallet) || null;
}


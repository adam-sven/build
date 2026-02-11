/* eslint-disable no-console */
import fs from "node:fs/promises";
import path from "node:path";

async function loadDotEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // file optional
  }
}

await loadDotEnvFile(path.join(process.cwd(), ".env"));
await loadDotEnvFile(path.join(process.cwd(), ".env.local"));

const API_KEY = process.env.HELIUS_API_KEY || "";
const NETWORK = (process.env.HELIUS_WEBHOOK_NETWORK || "mainnet").toLowerCase();
const BASE =
  NETWORK === "devnet"
    ? "https://api-devnet.helius-rpc.com"
    : "https://api-mainnet.helius-rpc.com";

const TX_TYPES = (process.env.HELIUS_WEBHOOK_TX_TYPES || "SWAP")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const TXN_STATUS = (process.env.HELIUS_WEBHOOK_TXN_STATUS || "success").toLowerCase();
const WEBHOOK_TYPE = process.env.HELIUS_WEBHOOK_TYPE || "enhanced";
const EXPLICIT_WEBHOOK_ID = process.env.HELIUS_WEBHOOK_ID || "";
const EXPLICIT_WEBHOOK_URL = process.env.HELIUS_WEBHOOK_URL || "";
const LIVE_APP_URL = process.env.LIVE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET || "";
const AUTH_HEADER = WEBHOOK_SECRET ? `Bearer ${WEBHOOK_SECRET}` : "";
const WALLETS_FILE = path.join(process.cwd(), "data", "smart-wallets.json");
const WALLET_PROFILES_FILE = path.join(process.cwd(), "data", "wallet-profiles.json");

if (!API_KEY) {
  console.error("[helius-sync] Missing HELIUS_API_KEY");
  process.exit(1);
}

function normalizeBaseUrl(url) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function resolveWebhookUrl() {
  if (EXPLICIT_WEBHOOK_URL) return EXPLICIT_WEBHOOK_URL;
  if (!LIVE_APP_URL) {
    throw new Error("Missing HELIUS_WEBHOOK_URL or LIVE_APP_URL/NEXT_PUBLIC_APP_URL");
  }
  return `${normalizeBaseUrl(LIVE_APP_URL)}/api/ingest/helius`;
}

async function loadWallets() {
  const isLikelyWallet = (value) => /^[1-9A-HJ-NP-Za-km-z]{32,50}$/.test(value);
  const out = new Set();

  try {
    const raw = await fs.readFile(WALLETS_FILE, "utf8");
    const json = JSON.parse(raw);
    const wallets = Array.isArray(json?.wallets) ? json.wallets : [];
    for (const wallet of wallets) {
      const value = String(wallet).trim();
      if (isLikelyWallet(value)) out.add(value);
    }
  } catch {
    // optional source
  }

  try {
    const raw = await fs.readFile(WALLET_PROFILES_FILE, "utf8");
    const json = JSON.parse(raw);
    const entries = Array.isArray(json?.entries) ? json.entries : [];
    for (const entry of entries) {
      const value = String(entry?.wallet || "").trim();
      if (isLikelyWallet(value)) out.add(value);
    }
  } catch {
    // optional source
  }

  const deduped = [...out];
  if (!deduped.length) {
    throw new Error("No wallets found in data/smart-wallets.json or data/wallet-profiles.json");
  }
  return deduped;
}

async function heliusFetch(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${txt.slice(0, 500)}`);
  }
  return res.json();
}

async function listWebhooks() {
  const url = `${BASE}/v0/webhooks?api-key=${encodeURIComponent(API_KEY)}`;
  const data = await heliusFetch(url);
  return Array.isArray(data) ? data : [];
}

async function createWebhook(payload) {
  const url = `${BASE}/v0/webhooks?api-key=${encodeURIComponent(API_KEY)}`;
  return heliusFetch(url, { method: "POST", body: JSON.stringify(payload) });
}

async function updateWebhook(id, payload) {
  const url = `${BASE}/v0/webhooks/${encodeURIComponent(id)}?api-key=${encodeURIComponent(API_KEY)}`;
  return heliusFetch(url, { method: "PUT", body: JSON.stringify(payload) });
}

function pickExistingWebhook(list, webhookUrl) {
  if (EXPLICIT_WEBHOOK_ID) {
    return list.find((w) => String(w?.webhookID || w?.webhookId || "") === EXPLICIT_WEBHOOK_ID) || null;
  }
  return (
    list.find((w) => String(w?.webhookURL || w?.webhookUrl || "") === webhookUrl) ||
    list.find((w) => String(w?.webhookURL || w?.webhookUrl || "").includes("/api/ingest/helius")) ||
    null
  );
}

async function main() {
  const webhookURL = resolveWebhookUrl();
  const wallets = await loadWallets();

  const payload = {
    webhookURL,
    webhookType: WEBHOOK_TYPE,
    transactionTypes: TX_TYPES,
    accountAddresses: wallets,
    txnStatus: TXN_STATUS,
    ...(AUTH_HEADER ? { authHeader: AUTH_HEADER } : {}),
  };

  const existing = pickExistingWebhook(await listWebhooks(), webhookURL);
  if (existing) {
    const id = String(existing.webhookID || existing.webhookId || "");
    if (!id) throw new Error("Found webhook but missing webhookID");
    const updated = await updateWebhook(id, payload);
    console.log(`[helius-sync] Updated webhook ${id}`);
    console.log(
      `[helius-sync] txTypes=${TX_TYPES.join(",")} wallets=${wallets.length} url=${webhookURL} network=${NETWORK}`,
    );
    if (updated?.webhookID || updated?.webhookId) {
      console.log(`[helius-sync] webhookID=${updated.webhookID || updated.webhookId}`);
    }
    return;
  }

  const created = await createWebhook(payload);
  console.log("[helius-sync] Created new webhook");
  console.log(
    `[helius-sync] txTypes=${TX_TYPES.join(",")} wallets=${wallets.length} url=${webhookURL} network=${NETWORK}`,
  );
  if (created?.webhookID || created?.webhookId) {
    console.log(`[helius-sync] webhookID=${created.webhookID || created.webhookId}`);
  }
}

main().catch((err) => {
  console.error("[helius-sync] Failed:", err?.message || err);
  process.exit(1);
});

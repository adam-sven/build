import { kv } from "@vercel/kv";

type MemoryValue = { value: string; expiresAt: number | null };
const memory = new Map<string, MemoryValue>();

function hasKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function kvGet<T>(key: string): Promise<T | null> {
  if (hasKv()) {
    const out = await kv.get<T>(key);
    return out ?? null;
  }
  const v = memory.get(key);
  if (!v) return null;
  if (v.expiresAt && v.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  try {
    return JSON.parse(v.value) as T;
  } catch {
    return null;
  }
}

export async function kvSet<T>(key: string, value: T, ttlSeconds?: number) {
  if (hasKv()) {
    if (ttlSeconds) {
      await kv.set(key, value, { ex: ttlSeconds });
      return;
    }
    await kv.set(key, value);
    return;
  }
  memory.set(key, {
    value: JSON.stringify(value),
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
}

export async function kvDel(key: string) {
  if (hasKv()) {
    await kv.del(key);
    return;
  }
  memory.delete(key);
}

export async function kvIncr(key: string, ttlSeconds?: number): Promise<number> {
  if (hasKv()) {
    const n = await kv.incr(key);
    if (ttlSeconds && n === 1) {
      await kv.expire(key, ttlSeconds);
    }
    return n;
  }

  const current = await kvGet<number>(key);
  const next = (current ?? 0) + 1;
  await kvSet(key, next, ttlSeconds);
  return next;
}

export async function kvSetNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  if (hasKv()) {
    const ok = await kv.setnx(key, value);
    if (ok) await kv.expire(key, ttlSeconds);
    return ok === 1;
  }
  if (memory.has(key)) {
    const existing = memory.get(key);
    if (existing?.expiresAt && existing.expiresAt < Date.now()) {
      memory.delete(key);
    } else {
      return false;
    }
  }
  await kvSet(key, value, ttlSeconds);
  return true;
}

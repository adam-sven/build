import { kv } from "@vercel/kv";
import Redis from "ioredis";
import { makeRedisClient } from "@/lib/trencher/redis";

type MemoryValue = { value: string; expiresAt: number | null };
const memory = new Map<string, MemoryValue>();
let redisClient: Redis | null = null;
let redisInitTried = false;
let redisConnecting: Promise<void> | null = null;
let redisReady = false;

function getRedis() {
  if (redisClient) return redisClient;
  if (redisInitTried) return null;
  redisInitTried = true;

  const url = process.env.REDIS_URL;
  if (!url && !(process.env.REDIS_HOST && process.env.REDIS_PORT)) return null;

  redisClient = makeRedisClient();
  if (!redisClient) return null;
  redisClient.on("error", () => {
    // Keep silent and allow fallback tiers.
  });
  return redisClient;
}

function hasKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function ensureRedisConnected(redis: Redis | null): Promise<Redis | null> {
  if (!redis) return null;
  if (redisReady || redis.status === "ready") {
    redisReady = true;
    return redis;
  }
  if (!redisConnecting) {
    redisConnecting = redis
      .connect()
      .then(() => {
        redisReady = true;
      })
      .catch(() => {
        redisReady = false;
      })
      .finally(() => {
        redisConnecting = null;
      });
  }
  await redisConnecting;
  return redisReady ? redis : null;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const redis = await ensureRedisConnected(getRedis());
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      // fallback to next storage tier
    }
  }

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
  const redis = await ensureRedisConnected(getRedis());
  if (redis) {
    try {
      const raw = JSON.stringify(value);
      if (ttlSeconds) {
        await redis.set(key, raw, "EX", ttlSeconds);
        return;
      }
      await redis.set(key, raw);
      return;
    } catch {
      // fallback to next storage tier
    }
  }

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
  const redis = await ensureRedisConnected(getRedis());
  if (redis) {
    try {
      await redis.del(key);
      return;
    } catch {
      // fallback to next storage tier
    }
  }

  if (hasKv()) {
    await kv.del(key);
    return;
  }
  memory.delete(key);
}

export async function kvIncr(key: string, ttlSeconds?: number): Promise<number> {
  const redis = await ensureRedisConnected(getRedis());
  if (redis) {
    try {
      const n = await redis.incr(key);
      if (ttlSeconds && n === 1) {
        await redis.expire(key, ttlSeconds);
      }
      return n;
    } catch {
      // fallback to next storage tier
    }
  }

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
  const redis = await ensureRedisConnected(getRedis());
  if (redis) {
    try {
      const out = await redis.set(key, value, "EX", ttlSeconds, "NX");
      return out === "OK";
    } catch {
      // fallback to next storage tier
    }
  }

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

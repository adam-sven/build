import Redis from "ioredis";

function parseBool(value: string | undefined, defaultValue: boolean) {
  if (!value) return defaultValue;
  return /^(1|true|yes|on)$/i.test(value);
}

export function hasRedisConfig(): boolean {
  return Boolean(process.env.REDIS_URL || (process.env.REDIS_HOST && process.env.REDIS_PORT));
}

export function makeRedisClient(): Redis | null {
  const url = process.env.REDIS_URL?.trim() || "";
  const host = process.env.REDIS_HOST?.trim() || "";
  const port = Number(process.env.REDIS_PORT || 0);
  const username = process.env.REDIS_USERNAME?.trim() || undefined;
  const password = process.env.REDIS_PASSWORD || undefined;
  const useTls = url.startsWith("rediss://") || parseBool(process.env.REDIS_TLS, false);

  try {
    if (url) {
      return new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        tls: useTls ? {} : undefined,
      });
    }
    if (!host || !port) return null;
    return new Redis({
      host,
      port,
      username,
      password,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      tls: useTls ? {} : undefined,
    });
  } catch {
    return null;
  }
}

import { randomUUID } from "crypto";
import { sql } from "@vercel/postgres";
import { kvGet, kvSet } from "@/lib/trencher/kv";
import type { Chain } from "@/lib/trencher/types";

type ApiKeyRow = { key: string; revoked_at: string | null };

type VoteRow = {
  id: string;
  chain: Chain;
  mint: string;
  voter: string;
  direction: "up" | "down";
  created_at: string;
  fee_tx_sig: string;
};

type SubmissionRow = {
  id: string;
  chain: Chain;
  mint: string;
  submitter: string;
  created_at: string;
  fee_tx_sig: string;
};

type SearchRow = {
  id: string;
  chain: Chain;
  query: string;
  resolved_mint: string | null;
  created_at: string;
};

const MEM = {
  votes: [] as VoteRow[],
  submissions: [] as SubmissionRow[],
  searches: [] as SearchRow[],
  tokens: new Map<
    string,
    {
      mint: string;
      chain: Chain;
      first_seen_at: string;
      last_seen_at: string;
      peak_rank: number;
      peak_score: number;
      peak_upvotes_24h: number;
      metadata_json: any;
    }
  >(),
};

function hasPostgres() {
  return Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL);
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  if (!apiKey) return false;
  if (hasPostgres()) {
    try {
      const result = await sql<ApiKeyRow>`
        SELECT key, revoked_at
        FROM api_keys
        WHERE key = ${apiKey}
        LIMIT 1
      `;
      return result.rows.length > 0 && !result.rows[0].revoked_at;
    } catch {
      // fallback below
    }
  }

  const envKeys = (process.env.API_KEYS || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (envKeys.includes(apiKey)) return true;

  const dbKeys = (await kvGet<string[]>("trencher:api_keys")) || [];
  return dbKeys.includes(apiKey);
}

export async function upsertToken(params: {
  chain: Chain;
  mint: string;
  metadataJson?: Record<string, unknown>;
  peakRank?: number;
  peakScore?: number;
  peakUpvotes24h?: number;
}) {
  const {
    chain,
    mint,
    metadataJson = {},
    peakRank = 0,
    peakScore = 0,
    peakUpvotes24h = 0,
  } = params;
  const now = new Date().toISOString();

  if (hasPostgres()) {
    try {
      await sql`
        INSERT INTO tokens (
          mint, chain, created_at, first_seen_at, last_seen_at,
          peak_rank, peak_score, peak_upvotes_24h, metadata_json
        ) VALUES (
          ${mint}, ${chain}, NOW(), NOW(), NOW(),
          ${peakRank}, ${peakScore}, ${peakUpvotes24h}, ${JSON.stringify(metadataJson)}::jsonb
        )
        ON CONFLICT (mint, chain)
        DO UPDATE SET
          last_seen_at = NOW(),
          metadata_json = COALESCE(tokens.metadata_json, '{}'::jsonb) || ${JSON.stringify(metadataJson)}::jsonb,
          peak_rank = CASE WHEN ${peakRank} > 0 AND (tokens.peak_rank = 0 OR ${peakRank} < tokens.peak_rank) THEN ${peakRank} ELSE tokens.peak_rank END,
          peak_score = GREATEST(tokens.peak_score, ${peakScore}),
          peak_upvotes_24h = GREATEST(tokens.peak_upvotes_24h, ${peakUpvotes24h})
      `;
      return;
    } catch {
      // fallback
    }
  }

  const key = `${chain}:${mint}`;
  const row = MEM.tokens.get(key);
  if (!row) {
    MEM.tokens.set(key, {
      mint,
      chain,
      first_seen_at: now,
      last_seen_at: now,
      peak_rank: peakRank,
      peak_score: peakScore,
      peak_upvotes_24h: peakUpvotes24h,
      metadata_json: metadataJson,
    });
    return;
  }

  row.last_seen_at = now;
  row.metadata_json = { ...(row.metadata_json || {}), ...metadataJson };
  if (peakRank > 0 && (row.peak_rank === 0 || peakRank < row.peak_rank)) row.peak_rank = peakRank;
  row.peak_score = Math.max(row.peak_score || 0, peakScore || 0);
  row.peak_upvotes_24h = Math.max(row.peak_upvotes_24h || 0, peakUpvotes24h || 0);
}

export async function createVote(input: {
  chain: Chain;
  mint: string;
  voter: string;
  direction: "up" | "down";
  feeTxSig: string;
}) {
  const id = randomUUID();
  if (hasPostgres()) {
    try {
      await sql`
        INSERT INTO votes (id, chain, mint, voter, direction, created_at, fee_tx_sig)
        VALUES (${id}, ${input.chain}, ${input.mint}, ${input.voter}, ${input.direction}, NOW(), ${input.feeTxSig})
      `;
      return id;
    } catch {
      // fallback
    }
  }
  MEM.votes.push({
    id,
    chain: input.chain,
    mint: input.mint,
    voter: input.voter,
    direction: input.direction,
    created_at: new Date().toISOString(),
    fee_tx_sig: input.feeTxSig,
  });
  return id;
}

export async function hasFeeSigUsed(type: "vote" | "submit", feeTxSig: string): Promise<boolean> {
  if (hasPostgres()) {
    try {
      const table = type === "vote" ? "votes" : "submissions";
      const result = await sql.query(`SELECT fee_tx_sig FROM ${table} WHERE fee_tx_sig = $1 LIMIT 1`, [feeTxSig]);
      return (result.rowCount || 0) > 0;
    } catch {
      // fallback
    }
  }

  if (type === "vote") return MEM.votes.some((v) => v.fee_tx_sig === feeTxSig);
  return MEM.submissions.some((s) => s.fee_tx_sig === feeTxSig);
}

export async function createSubmission(input: {
  chain: Chain;
  mint: string;
  submitter: string;
  feeTxSig: string;
}) {
  const id = randomUUID();
  if (hasPostgres()) {
    try {
      await sql`
        INSERT INTO submissions (id, chain, mint, submitter, created_at, fee_tx_sig)
        VALUES (${id}, ${input.chain}, ${input.mint}, ${input.submitter}, NOW(), ${input.feeTxSig})
      `;
      return id;
    } catch {
      // fallback
    }
  }

  MEM.submissions.push({
    id,
    chain: input.chain,
    mint: input.mint,
    submitter: input.submitter,
    created_at: new Date().toISOString(),
    fee_tx_sig: input.feeTxSig,
  });
  return id;
}

export async function hasSubmissionForMint(chain: Chain, mint: string): Promise<boolean> {
  if (hasPostgres()) {
    try {
      const rows = await sql<{ mint: string }>`
        SELECT mint
        FROM submissions
        WHERE chain = ${chain} AND mint = ${mint}
        LIMIT 1
      `;
      if (rows.rows.length > 0) return true;
    } catch {
      // fallback
    }
  }

  return MEM.submissions.some((s) => s.chain === chain && s.mint === mint);
}

export async function logSearch(input: { chain: Chain; query: string; resolvedMint: string | null }) {
  const id = randomUUID();
  if (hasPostgres()) {
    try {
      await sql`
        INSERT INTO searches (id, chain, query, resolved_mint, created_at)
        VALUES (${id}, ${input.chain}, ${input.query}, ${input.resolvedMint}, NOW())
      `;
      return;
    } catch {
      // fallback
    }
  }

  MEM.searches.push({
    id,
    chain: input.chain,
    query: input.query,
    resolved_mint: input.resolvedMint,
    created_at: new Date().toISOString(),
  });
}

export async function getSearchCounts(chain: Chain, mint: string): Promise<{ searches1h: number; searches24h: number }> {
  if (hasPostgres()) {
    try {
      const rows = await sql<{
        searches1h: string;
        searches24h: string;
      }>`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour')::text AS searches1h,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::text AS searches24h
        FROM searches
        WHERE chain = ${chain} AND resolved_mint = ${mint}
      `;
      return {
        searches1h: Number(rows.rows[0]?.searches1h || "0"),
        searches24h: Number(rows.rows[0]?.searches24h || "0"),
      };
    } catch {
      // fallback
    }
  }

  const now = Date.now();
  const list = MEM.searches.filter((s) => s.chain === chain && s.resolved_mint === mint);
  return {
    searches1h: list.filter((s) => now - new Date(s.created_at).getTime() <= 3600_000).length,
    searches24h: list.filter((s) => now - new Date(s.created_at).getTime() <= 24 * 3600_000).length,
  };
}

export async function getVotes24h(chain: Chain, mint: string): Promise<{ up24h: number; down24h: number }> {
  if (hasPostgres()) {
    try {
      const rows = await sql<{
        up24h: string;
        down24h: string;
      }>`
        SELECT
          COUNT(*) FILTER (WHERE direction = 'up' AND created_at >= NOW() - INTERVAL '24 hour')::text AS up24h,
          COUNT(*) FILTER (WHERE direction = 'down' AND created_at >= NOW() - INTERVAL '24 hour')::text AS down24h
        FROM votes
        WHERE chain = ${chain} AND mint = ${mint}
      `;
      return {
        up24h: Number(rows.rows[0]?.up24h || "0"),
        down24h: Number(rows.rows[0]?.down24h || "0"),
      };
    } catch {
      // fallback
    }
  }

  const now = Date.now();
  const list = MEM.votes.filter(
    (v) => v.chain === chain && v.mint === mint && now - new Date(v.created_at).getTime() <= 24 * 3600_000,
  );
  return {
    up24h: list.filter((v) => v.direction === "up").length,
    down24h: list.filter((v) => v.direction === "down").length,
  };
}

export async function getVoteCooldown(chain: Chain, mint: string, voter: string): Promise<Date | null> {
  if (hasPostgres()) {
    try {
      const rows = await sql<{ created_at: string }>`
        SELECT created_at
        FROM votes
        WHERE chain = ${chain} AND mint = ${mint} AND voter = ${voter}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      return rows.rows[0]?.created_at ? new Date(rows.rows[0].created_at) : null;
    } catch {
      // fallback
    }
  }

  const match = MEM.votes
    .filter((v) => v.chain === chain && v.mint === mint && v.voter === voter)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0];
  return match ? new Date(match.created_at) : null;
}

export async function getVoteDailyCount(chain: Chain, voter: string): Promise<number> {
  if (hasPostgres()) {
    try {
      const rows = await sql<{ c: string }>`
        SELECT COUNT(*)::text AS c
        FROM votes
        WHERE chain = ${chain} AND voter = ${voter} AND created_at >= NOW() - INTERVAL '1 day'
      `;
      return Number(rows.rows[0]?.c || "0");
    } catch {
      // fallback
    }
  }

  const now = Date.now();
  return MEM.votes.filter(
    (v) => v.chain === chain && v.voter === voter && now - new Date(v.created_at).getTime() <= 24 * 3600_000,
  ).length;
}

export async function getRecentVoters(chain: Chain, mint: string, limit = 20): Promise<string[]> {
  if (hasPostgres()) {
    try {
      const rows = await sql<{ voter: string }>`
        SELECT voter
        FROM votes
        WHERE chain = ${chain} AND mint = ${mint}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return rows.rows.map((r) => r.voter);
    } catch {
      // fallback
    }
  }
  return MEM.votes
    .filter((v) => v.chain === chain && v.mint === mint)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, limit)
    .map((v) => v.voter);
}

export async function getCandidateMints(chain: Chain): Promise<string[]> {
  if (hasPostgres()) {
    try {
      const [subRows, voteRows, searchRows] = await Promise.all([
        sql<{ mint: string }>`
          SELECT DISTINCT mint FROM submissions WHERE chain = ${chain} AND created_at >= NOW() - INTERVAL '7 day'
        `,
        sql<{ mint: string }>`
          SELECT DISTINCT mint FROM votes WHERE chain = ${chain} AND created_at >= NOW() - INTERVAL '1 day'
        `,
        sql<{ resolved_mint: string }>`
          SELECT resolved_mint FROM searches
          WHERE chain = ${chain} AND created_at >= NOW() - INTERVAL '1 day' AND resolved_mint IS NOT NULL
          GROUP BY resolved_mint
          ORDER BY COUNT(*) DESC
          LIMIT 250
        `,
      ]);
      const out = new Set<string>();
      subRows.rows.forEach((r) => out.add(r.mint));
      voteRows.rows.forEach((r) => out.add(r.mint));
      searchRows.rows.forEach((r) => out.add(r.resolved_mint));
      return [...out];
    } catch {
      // fallback
    }
  }

  const now = Date.now();
  const out = new Set<string>();
  MEM.submissions
    .filter((s) => s.chain === chain && now - new Date(s.created_at).getTime() <= 7 * 24 * 3600_000)
    .forEach((s) => out.add(s.mint));
  MEM.votes
    .filter((v) => v.chain === chain && now - new Date(v.created_at).getTime() <= 24 * 3600_000)
    .forEach((v) => out.add(v.mint));
  MEM.searches
    .filter((s) => s.chain === chain && s.resolved_mint && now - new Date(s.created_at).getTime() <= 24 * 3600_000)
    .forEach((s) => out.add(s.resolved_mint as string));
  return [...out];
}

export async function getTokenPeak(chain: Chain, mint: string): Promise<{ peakRank: number; peakScore: number; peakUpvotes24h: number }> {
  if (hasPostgres()) {
    try {
      const rows = await sql<{
        peak_rank: number;
        peak_score: number;
        peak_upvotes_24h: number;
      }>`
        SELECT peak_rank, peak_score, peak_upvotes_24h
        FROM tokens
        WHERE chain = ${chain} AND mint = ${mint}
        LIMIT 1
      `;
      if (!rows.rows[0]) return { peakRank: 0, peakScore: 0, peakUpvotes24h: 0 };
      return {
        peakRank: Number(rows.rows[0].peak_rank || 0),
        peakScore: Number(rows.rows[0].peak_score || 0),
        peakUpvotes24h: Number(rows.rows[0].peak_upvotes_24h || 0),
      };
    } catch {
      // fallback
    }
  }
  const row = MEM.tokens.get(`${chain}:${mint}`);
  return {
    peakRank: row?.peak_rank || 0,
    peakScore: row?.peak_score || 0,
    peakUpvotes24h: row?.peak_upvotes_24h || 0,
  };
}

export async function cacheFeed(chain: Chain, mode: string, feed: any, ttlSeconds = 120) {
  await Promise.all([
    kvSet(`trencher:feed:${chain}:${mode}`, feed, ttlSeconds),
    kvSet(`trencher:feed:stale:${chain}:${mode}`, feed, Math.max(600, ttlSeconds * 5)),
  ]);
}

export async function getCachedFeed<T>(
  chain: Chain,
  mode: string,
  options?: { allowStale?: boolean },
): Promise<T | null> {
  const fresh = await kvGet<T>(`trencher:feed:${chain}:${mode}`);
  if (fresh) return fresh;
  if (options?.allowStale) {
    return kvGet<T>(`trencher:feed:stale:${chain}:${mode}`);
  }
  return null;
}

export async function cacheToken(chain: Chain, mint: string, payload: any, ttlSeconds = 45) {
  await kvSet(`trencher:token:${chain}:${mint}`, payload, ttlSeconds);
}

export async function getCachedToken<T>(chain: Chain, mint: string): Promise<T | null> {
  return kvGet<T>(`trencher:token:${chain}:${mint}`);
}

export async function initDefaultApiKeys() {
  const envKeys = (process.env.API_KEYS || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (envKeys.length > 0) {
    await kvSet("trencher:api_keys", envKeys, 86400);
  }
}

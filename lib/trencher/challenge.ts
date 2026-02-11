import { randomUUID } from "crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { kvDel, kvGet, kvSet } from "@/lib/trencher/kv";

type ChallengeKind = "vote" | "submit";

type ChallengeRecord = {
  nonce: string;
  wallet: string;
  chain: string;
  mint: string;
  direction?: "up" | "down";
  kind: ChallengeKind;
  expiresAt: number;
};

const TTL_SECONDS = 300;

function key(kind: ChallengeKind, nonce: string) {
  return `trencher:challenge:${kind}:${nonce}`;
}

export async function createChallenge(params: {
  kind: ChallengeKind;
  wallet: string;
  chain: string;
  mint: string;
  direction?: "up" | "down";
}) {
  const nonce = randomUUID();
  const expiresAt = Date.now() + TTL_SECONDS * 1000;
  const payload: ChallengeRecord = {
    nonce,
    wallet: params.wallet,
    chain: params.chain,
    mint: params.mint,
    direction: params.direction,
    kind: params.kind,
    expiresAt,
  };

  await kvSet(key(params.kind, nonce), payload, TTL_SECONDS);

  const action = params.kind === "vote" ? "vote" : "submit";
  const directionText = params.direction ? `\nDirection: ${params.direction}` : "";
  const messageToSign = [
    "IamTrader Challenge",
    `Action: ${action}`,
    `Wallet: ${params.wallet}`,
    `Chain: ${params.chain}`,
    `Mint: ${params.mint}`,
    `Nonce: ${nonce}`,
    `ExpiresAt: ${new Date(expiresAt).toISOString()}`,
    directionText,
    "This signature only proves wallet ownership.",
  ]
    .filter(Boolean)
    .join("\n");

  return { nonce, messageToSign, expiresAt };
}

export async function consumeAndVerifyChallenge(params: {
  kind: ChallengeKind;
  nonce: string;
  wallet: string;
  mint: string;
  chain: string;
  direction?: "up" | "down";
  message: string;
  signatureBase64: string;
}) {
  const challenge = await kvGet<ChallengeRecord>(key(params.kind, params.nonce));
  if (!challenge || challenge.expiresAt < Date.now()) {
    return { ok: false as const, code: "nonce_expired" as const };
  }

  if (
    challenge.wallet !== params.wallet ||
    challenge.chain !== params.chain ||
    challenge.mint !== params.mint ||
    (challenge.direction || null) !== (params.direction || null)
  ) {
    return { ok: false as const, code: "invalid_signature" as const };
  }

  try {
    const sig = Buffer.from(params.signatureBase64, "base64");
    const msg = new TextEncoder().encode(params.message);
    const pub = bs58.decode(params.wallet);
    const valid = nacl.sign.detached.verify(msg, sig, pub);
    if (!valid) {
      return { ok: false as const, code: "invalid_signature" as const };
    }
  } catch {
    return { ok: false as const, code: "invalid_signature" as const };
  }

  await kvDel(key(params.kind, params.nonce));
  return { ok: true as const };
}

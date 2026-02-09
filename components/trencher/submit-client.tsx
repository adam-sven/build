"use client";

import { useState } from "react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SUBMIT_FEE_LAMPORTS, TREASURY_PUBKEY } from "@/lib/trencher/public";

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export default function SubmitClient() {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, connected, signMessage, sendTransaction } = useWallet();

  const [mint, setMint] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedMint, setSubmittedMint] = useState<string | null>(null);

  const shareLink = submittedMint
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/intel?mint=${submittedMint}`
    : "";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected || !publicKey || !signMessage || !sendTransaction) {
      setError("Connect wallet first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const challengeRes = await fetch(
        `/api/ui/submit/challenge?chain=solana&wallet=${publicKey.toBase58()}&mint=${mint}`,
      );
      const challenge = await challengeRes.json();
      if (!challengeRes.ok) {
        if (challenge?.error?.code === "token_already_submitted") {
          router.push(`/intel?mint=${mint}`);
          return;
        }
        throw new Error(challenge?.error?.message || "Challenge failed");
      }

      setStep(1);
      const signature = await signMessage(new TextEncoder().encode(challenge.messageToSign));
      const signatureBase64 = bytesToBase64(signature);

      setStep(2);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(TREASURY_PUBKEY),
          lamports: SUBMIT_FEE_LAMPORTS,
        }),
      );
      const feeTxSig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(feeTxSig, "confirmed");

      const confirmRes = await fetch("/api/ui/submit/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chain: "solana",
          mint,
          wallet: publicKey.toBase58(),
          nonce: challenge.nonce,
          message: challenge.messageToSign,
          signature: signatureBase64,
          feeTxSig,
        }),
      });
      const confirm = await confirmRes.json();
      if (!confirmRes.ok) {
        if (confirm?.error?.code === "token_already_submitted") {
          router.push(`/intel?mint=${mint}`);
          return;
        }
        throw new Error(confirm?.error?.message || "Submit failed");
      }

      setSubmittedMint(mint);
    } catch (e: any) {
      setError(e?.message || "Failed to submit");
    } finally {
      setLoading(false);
    }
  };

  if (submittedMint) {
    return (
      <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-4">
        <h3 className="text-base font-semibold text-emerald-200">Token submitted</h3>
        <p className="mt-2 text-sm text-white/75">
          Share this link so people can open Intel, vote, and discuss the token.
        </p>
        <div className="mt-3 rounded border border-white/15 bg-black/35 px-3 py-2 text-xs text-white/70 break-all">
          {shareLink}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-white/20"
            onClick={() => navigator.clipboard.writeText(shareLink)}
          >
            Copy share link
          </Button>
          <Button
            type="button"
            className="bg-emerald-400 text-black hover:opacity-90"
            onClick={() => router.push(`/intel?mint=${submittedMint}`)}
          >
            Open Intel
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSubmittedMint(null);
              setMint("");
            }}
          >
            Submit another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-white/10 bg-black/30 p-4">
      <label className="text-xs uppercase tracking-wide text-white/50">Mint</label>
      <Input
        value={mint}
        onChange={(e) => setMint(e.target.value.trim())}
        placeholder="So111..."
        className="mt-2 border-white/10 bg-black/40"
      />

      <div className="mt-4 text-sm text-white/65">Step {step}/2: Sign message, then send 0.01 SOL submit fee.</div>
      <div className="mt-2 text-xs text-white/50">Submission does not guarantee ranking.</div>
      {error && <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-200">{error}</div>}

      <Button type="submit" className="mt-4 bg-emerald-400 text-black hover:opacity-90" disabled={loading}>
        {loading ? "Processing..." : "Submit token"}
      </Button>
    </form>
  );
}

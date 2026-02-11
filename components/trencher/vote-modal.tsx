"use client";

import { useState } from "react";
import { SystemProgram, Transaction, PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TREASURY_PUBKEY, VOTE_FEE_LAMPORTS } from "@/lib/trencher/public";

type Props = {
  mint: string;
  direction: "up" | "down";
  onClose: () => void;
  onSuccess: () => void;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export default function VoteModal({ mint, direction, onClose, onSuccess }: Props) {
  const { publicKey, signMessage, signTransaction, sendTransaction } = useWallet();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!publicKey || !signMessage) {
      setError("Connect wallet first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const challengeRes = await fetch(
        `/api/ui/vote/challenge?chain=solana&wallet=${publicKey.toBase58()}&mint=${mint}&direction=${direction}`,
      );
      const challenge = await challengeRes.json();
      if (!challengeRes.ok) {
        throw new Error(challenge?.error?.message || "Failed to create challenge");
      }

      setStep(1);
      const encoded = new TextEncoder().encode(challenge.messageToSign);
      const sig = await signMessage(encoded);
      const signatureBase64 = bytesToBase64(sig);

      setStep(2);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(TREASURY_PUBKEY),
          lamports: VOTE_FEE_LAMPORTS,
        }),
      );

      let feeTxSig: string | null = null;
      if (signTransaction) {
        // Avoid relying on the browser RPC for blockhash (some endpoints return 403 to browsers).
        const bhRes = await fetch("/api/ui/solana/blockhash");
        const bh = await bhRes.json();
        if (!bhRes.ok) throw new Error(bh?.error?.message || "Failed to get recent blockhash");
        tx.feePayer = publicKey;
        tx.recentBlockhash = bh.blockhash;

        const signed = await signTransaction(tx);
        const txBase64 = Buffer.from(signed.serialize()).toString("base64");
        const sendRes = await fetch("/api/ui/solana/send-fee-transaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "vote", txBase64 }),
        });
        const sent = await sendRes.json();
        if (!sendRes.ok) throw new Error(sent?.error?.message || "Failed to broadcast fee transaction");
        feeTxSig = sent.signature;
      } else if (sendTransaction) {
        // Fallback: old path (may fail if the user's browser RPC blocks blockhash requests).
        const { Connection } = await import("@solana/web3.js");
        const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
        feeTxSig = await sendTransaction(tx, connection);
        await connection.confirmTransaction(feeTxSig, "confirmed");
      } else {
        throw new Error("Wallet does not support signing transactions.");
      }

      const submitRes = await fetch(`/api/ui/vote/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chain: "solana",
          mint,
          wallet: publicKey.toBase58(),
          direction,
          nonce: challenge.nonce,
          message: challenge.messageToSign,
          signature: signatureBase64,
          feeTxSig,
        }),
      });
      const submit = await submitRes.json();
      if (!submitRes.ok) {
        throw new Error(submit?.error?.message || "Vote failed");
      }

      onSuccess();
    } catch (e: any) {
      setError(e?.message || "Failed to cast vote");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="border-white/10 bg-[#070a12] text-white">
        <DialogHeader>
          <DialogTitle>Cast vote</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-white/70">Step {step}/2</p>
        <div className="rounded border border-white/10 bg-black/30 p-3 text-xs text-white/70">
          <p className="font-medium text-white/85">Voting requirements</p>
          <p className="mt-1">1. Wallet age must be at least 7 days.</p>
          <p>2. Wallet must hold at least 0.1 SOL (proof-of-activity check, not spent).</p>
          <p>3. Vote fee is 0.001 SOL sent to treasury (anti-spam).</p>
          <p className="mt-1 text-white/55">Fee does not guarantee ranking placement.</p>
        </div>
        <p className="text-xs text-white/50">
          Treasury: {TREASURY_PUBKEY.slice(0, 6)}...{TREASURY_PUBKEY.slice(-6)}
        </p>
        {error && <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-200">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="border-white/20 bg-transparent" onClick={onClose}>Cancel</Button>
          <Button className="bg-emerald-400 text-black hover:opacity-90" disabled={loading} onClick={run}>
            {loading ? "Processing..." : `Confirm ${direction}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

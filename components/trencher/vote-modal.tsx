"use client";

import { useState } from "react";
import { SystemProgram, Transaction, PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
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
  const { connection } = useConnection();
  const { publicKey, signMessage, sendTransaction } = useWallet();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!publicKey || !signMessage || !sendTransaction) {
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
      const feeTxSig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(feeTxSig, "confirmed");

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
        <p className="text-sm text-white/60">Fee is anti-spam only. It does not guarantee ranking.</p>
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

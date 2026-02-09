"use client";

import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function shortAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function ConnectButton() {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const label = useMemo(() => {
    if (!connected || !publicKey) return "Select Wallet";
    return shortAddress(publicKey.toBase58());
  }, [connected, publicKey]);

  if (!connected || !publicKey) {
    return (
      <Button
        type="button"
        onClick={() => setVisible(true)}
        className="h-9 rounded-lg border border-emerald-400/40 bg-emerald-400 px-3 text-xs font-semibold text-black hover:bg-emerald-300"
      >
        {label}
      </Button>
    );
  }

  const walletAddress = publicKey.toBase58();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          className="h-9 rounded-lg border border-cyan-400/40 bg-cyan-400/15 px-3 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/25"
        >
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 border-white/10 bg-black/95 text-white">
        <DropdownMenuItem
          className="text-xs text-white/85"
          onClick={() => navigator.clipboard.writeText(walletAddress)}
        >
          Copy address
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs text-white/85" onClick={() => setVisible(true)}>
          Change wallet
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs text-red-300 focus:text-red-300" onClick={() => disconnect()}>
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

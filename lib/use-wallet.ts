'use client';

import { useEffect, useState } from 'react';

interface PhantomProvider {
  isPhantom?: boolean;
  connect: () => Promise<{ publicKey: { toString: () => string } }>;
  disconnect: () => Promise<void>;
  on: (event: string, callback: () => void) => void;
  off: (event: string, callback: () => void) => void;
}

export function useWallet() {
  const [connected, setConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const getProvider = (): PhantomProvider | undefined => {
    if (typeof window !== 'undefined' && (window as any).phantom?.solana) {
      return (window as any).phantom.solana;
    }
    return undefined;
  };

  useEffect(() => {
    const provider = getProvider();
    if (provider) {
      setConnected(provider.isPhantom === true);
      if (provider.isPhantom) {
        // Check if already connected
        const checkConnection = async () => {
          try {
            const response = await (provider as any).connect({ onlyIfTrusted: true });
            setPublicKey(response.publicKey.toString());
            setConnected(true);
          } catch (err) {
            setConnected(false);
          }
          setLoading(false);
        };
        checkConnection();
      } else {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const connect = async () => {
    const provider = getProvider();
    if (!provider) {
      window.open('https://phantom.app/', '_blank');
      return;
    }

    try {
      const response = await provider.connect();
      setPublicKey(response.publicKey.toString());
      setConnected(true);
      return response.publicKey.toString();
    } catch (err) {
      console.error('Failed to connect wallet:', err);
      throw err;
    }
  };

  const disconnect = async () => {
    const provider = getProvider();
    if (provider) {
      try {
        await provider.disconnect();
      } catch (err) {
        console.error('Failed to disconnect wallet:', err);
      }
    }
    setPublicKey(null);
    setConnected(false);
  };

  return {
    connected,
    publicKey,
    connect,
    disconnect,
    loading,
    phantomInstalled: !!getProvider(),
  };
}

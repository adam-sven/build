import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizeImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const value = url.trim();
  if (!value) return null;

  if (value.startsWith("ipfs://")) {
    const cidPath = value.replace(/^ipfs:\/\//, "");
    return `https://ipfs.io/ipfs/${cidPath}`;
  }
  if (value.startsWith("ar://")) {
    const id = value.replace(/^ar:\/\//, "");
    return `https://arweave.net/${id}`;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return null;
}

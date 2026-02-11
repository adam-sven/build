"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function formatUsdCompact(v: number) {
  if (!Number.isFinite(v)) return "-";
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}b`;
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}m`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  if (abs < 0.01) return `$${v.toFixed(6)}`;
  return `$${v.toFixed(2)}`;
}

export default function AnimatedUsd({
  value,
  className,
  placeholder = "-",
}: {
  value: number | null;
  className?: string;
  placeholder?: string;
}) {
  const [display, setDisplay] = useState<number>(0);
  const fromRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (value === null || !Number.isFinite(value)) return;
    const start = performance.now();
    const from = mountedRef.current ? fromRef.current : 0;
    const to = value;
    const duration = 700;
    mountedRef.current = true;

    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + (to - from) * eased;
      setDisplay(next);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const text = useMemo(() => {
    if (value === null || !Number.isFinite(value)) return placeholder;
    return formatUsdCompact(display);
  }, [display, placeholder, value]);

  return <span className={className}>{text}</span>;
}


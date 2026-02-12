"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export default function AnimatedNumber({
  value,
  className,
  placeholder = "-",
  durationMs = 550,
  decimals = 2,
  format,
}: {
  value: number | null | undefined;
  className?: string;
  placeholder?: string;
  durationMs?: number;
  decimals?: number;
  format?: (v: number) => string;
}) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    const from = mountedRef.current ? fromRef.current : value;
    const to = value;
    const start = performance.now();
    mountedRef.current = true;

    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
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
  }, [value, durationMs]);

  const text = useMemo(() => {
    if (typeof value !== "number" || !Number.isFinite(value)) return placeholder;
    if (format) return format(display);
    return display.toFixed(decimals);
  }, [value, placeholder, format, display, decimals]);

  return <span className={className}>{text}</span>;
}


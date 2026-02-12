"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function formatSol(v: number, digits = 2, withSign = true) {
  if (!Number.isFinite(v)) return "-";
  const sign = withSign && v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)} SOL`;
}

export default function AnimatedSol({
  value,
  className,
  placeholder = "-",
  digits = 2,
  withSign = true,
}: {
  value: number | null | undefined;
  className?: string;
  placeholder?: string;
  digits?: number;
  withSign?: boolean;
}) {
  const [display, setDisplay] = useState<number>(0);
  const fromRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    const from = mountedRef.current ? fromRef.current : value;
    const to = value;
    const start = performance.now();
    const duration = 550;
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
    if (typeof value !== "number" || !Number.isFinite(value)) return placeholder;
    return formatSol(display, digits, withSign);
  }, [display, digits, placeholder, value, withSign]);

  return <span className={className}>{text}</span>;
}


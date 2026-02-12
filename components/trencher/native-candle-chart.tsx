"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

type Point = {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function fmtNum(v: number) {
  if (!Number.isFinite(v)) return "-";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}m`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  if (Math.abs(v) < 1) return v.toFixed(6);
  return v.toFixed(2);
}

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleString();
}

export default function NativeCandleChart({
  symbol,
  data,
  isLightTheme = false,
}: {
  symbol: string;
  data: Point[];
  isLightTheme?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram", Time> | null>(null);

  const [hover, setHover] = useState<Point | null>(null);
  const byTime = useMemo(() => {
    const map = new Map<number, Point>();
    for (const item of data) map.set(item.t, item);
    return map;
  }, [data]);

  const palette = useMemo(
    () =>
      isLightTheme
        ? {
            bg: "#ffffff",
            text: "#0f172a",
            grid: "rgba(148,163,184,0.28)",
            crosshair: "#0ea5e9",
            crossLabelBg: "#e2e8f0",
            scaleBorder: "rgba(15,23,42,0.18)",
            up: "#10b981",
            down: "#ef4444",
            volumeUp: "rgba(16,185,129,0.35)",
            volumeDown: "rgba(239,68,68,0.35)",
            priceLine: "#0891b2",
            legendBorder: "rgba(15,23,42,0.12)",
            legendBg: "rgba(255,255,255,0.85)",
            legendText: "#0f172a",
            legendSubtext: "rgba(15,23,42,0.75)",
          }
        : {
            bg: "#020b18",
            text: "#94a3b8",
            grid: "rgba(17, 66, 106, 0.35)",
            crosshair: "#22d3ee",
            crossLabelBg: "#0f172a",
            scaleBorder: "rgba(148,163,184,0.2)",
            up: "#14f1d9",
            down: "#f8fafc",
            volumeUp: "rgba(20,241,217,0.5)",
            volumeDown: "rgba(248,250,252,0.45)",
            priceLine: "#22d3ee",
            legendBorder: "rgba(255,255,255,0.1)",
            legendBg: "rgba(0,0,0,0.65)",
            legendText: "rgba(255,255,255,0.9)",
            legendSubtext: "rgba(255,255,255,0.75)",
          },
    [isLightTheme],
  );

  useEffect(() => {
    if (!wrapRef.current) return;

    const chart = createChart(wrapRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: palette.bg },
        textColor: palette.text,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      crosshair: {
        vertLine: { color: palette.crosshair, width: 1, style: 2, labelBackgroundColor: palette.crossLabelBg },
        horzLine: { color: palette.crosshair, width: 1, style: 2, labelBackgroundColor: palette.crossLabelBg },
      },
      rightPriceScale: {
        borderColor: palette.scaleBorder,
      },
      timeScale: {
        borderColor: palette.scaleBorder,
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: palette.up,
      downColor: palette.down,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
      borderVisible: false,
      priceLineVisible: true,
      priceLineColor: palette.priceLine,
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      borderVisible: false,
    });

    chartRef.current = chart;
    candleRef.current = candle;
    volumeRef.current = volume;

    const ro = new ResizeObserver(() => {
      if (!wrapRef.current || !chartRef.current) return;
      const w = wrapRef.current.clientWidth;
      const h = wrapRef.current.clientHeight;
      chartRef.current.applyOptions({ width: w, height: h });
    });
    ro.observe(wrapRef.current);

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setHover(null);
        return;
      }
      const t = Number(param.time);
      setHover(byTime.get(t) || null);
    });

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
    };
  }, [byTime, palette]);

  useEffect(() => {
    const candle = candleRef.current;
    const volume = volumeRef.current;
    const chart = chartRef.current;
    if (!candle || !volume || !chart) return;

    const candles = data.map((x) => ({
      time: x.t as UTCTimestamp,
      open: x.open,
      high: x.high,
      low: x.low,
      close: x.close,
    }));
    const volumes = data.map((x) => ({
      time: x.t as UTCTimestamp,
      value: x.volume,
      color: x.close >= x.open ? palette.volumeUp : palette.volumeDown,
    }));
    candle.setData(candles);
    volume.setData(volumes);
    chart.timeScale().fitContent();
  }, [data, palette]);

  const refPoint = hover || data[data.length - 1] || null;

  return (
    <div className="h-full w-full">
      <div
        className="pointer-events-none absolute left-2 top-2 z-10 rounded-md border px-2 py-1 text-[11px]"
        style={{
          borderColor: palette.legendBorder,
          background: palette.legendBg,
          color: palette.legendSubtext,
        }}
      >
        <div className="font-semibold" style={{ color: palette.legendText }}>{symbol}</div>
        {refPoint && (
          <div className="mt-0.5">
            {fmtDate(refPoint.t)} • O {fmtNum(refPoint.open)} • H {fmtNum(refPoint.high)} • L {fmtNum(refPoint.low)} • C{" "}
            {fmtNum(refPoint.close)} • V {fmtNum(refPoint.volume)}
          </div>
        )}
      </div>
      <div ref={wrapRef} className="h-full w-full" />
    </div>
  );
}

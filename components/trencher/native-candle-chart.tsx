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
}: {
  symbol: string;
  data: Point[];
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

  useEffect(() => {
    if (!wrapRef.current) return;

    const chart = createChart(wrapRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#020b18" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "rgba(17, 66, 106, 0.35)" },
        horzLines: { color: "rgba(17, 66, 106, 0.35)" },
      },
      crosshair: {
        vertLine: { color: "#22d3ee", width: 1, style: 2, labelBackgroundColor: "#0f172a" },
        horzLine: { color: "#22d3ee", width: 1, style: 2, labelBackgroundColor: "#0f172a" },
      },
      rightPriceScale: {
        borderColor: "rgba(148,163,184,0.2)",
      },
      timeScale: {
        borderColor: "rgba(148,163,184,0.2)",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: "#14f1d9",
      downColor: "#f8fafc",
      wickUpColor: "#14f1d9",
      wickDownColor: "#f8fafc",
      borderVisible: false,
      priceLineVisible: true,
      priceLineColor: "#22d3ee",
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
  }, [byTime]);

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
      color: x.close >= x.open ? "rgba(20,241,217,0.5)" : "rgba(248,250,252,0.45)",
    }));
    candle.setData(candles);
    volume.setData(volumes);
    chart.timeScale().fitContent();
  }, [data]);

  const refPoint = hover || data[data.length - 1] || null;

  return (
    <div className="h-full w-full">
      <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-md border border-white/10 bg-black/65 px-2 py-1 text-[11px] text-white/80">
        <div className="font-semibold text-white/90">{symbol}</div>
        {refPoint && (
          <div className="mt-0.5 text-white/75">
            {fmtDate(refPoint.t)} • O {fmtNum(refPoint.open)} • H {fmtNum(refPoint.high)} • L {fmtNum(refPoint.low)} • C{" "}
            {fmtNum(refPoint.close)} • V {fmtNum(refPoint.volume)}
          </div>
        )}
      </div>
      <div ref={wrapRef} className="h-full w-full" />
    </div>
  );
}

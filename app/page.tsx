import Link from "next/link";
import { ArrowRight, BarChart3, Bot, Radar, ShieldCheck, Users } from "lucide-react";

const corePillars = [
  {
    title: "Explainable Ranking",
    body: "Every token surface is driven by votes, search interest, and market quality. No paid boosts.",
    icon: Radar,
  },
  {
    title: "Live Smart Wallets",
    body: "Track wallet behavior and top bought tokens in one shared snapshot built for fast discovery.",
    icon: Users,
  },
  {
    title: "Token Intel View",
    body: "Open a mint and get chart, holders, risk hints, and vote state in one structured pane.",
    icon: BarChart3,
  },
];

const steps = [
  {
    title: "Discover",
    body: "Start in Discover or Smart Wallets to spot active mints and wallet clusters.",
  },
  {
    title: "Validate",
    body: "Open Intel to check liquidity, volume, holder concentration, and recent behavior.",
  },
  {
    title: "Act",
    body: "Vote with anti-spam fee, submit new mints, or route to your trading terminal.",
  },
];

const checks = [
  "Liquidity / volume mismatch",
  "Holder concentration and top 10%",
  "Search vs. market divergence",
  "Vote score trend vs. price move",
  "Smart-wallet overlap and recency",
  "Signal confidence before showing strong claims",
];

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_50%_0%,rgba(34,211,238,0.12),transparent_60%),linear-gradient(to_bottom,rgba(10,18,36,0.35),transparent_35%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background:linear-gradient(to_right,rgba(34,211,238,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(34,211,238,0.08)_1px,transparent_1px)] [background-size:56px_56px]" />

      <section className="relative mx-auto w-full max-w-6xl px-4 pb-14 pt-16 md:px-8 md:pt-24">
        <div className="load-in mx-auto max-w-3xl text-center" style={{ animationDelay: "40ms" }}>
          <span className="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-300">
            Solana attention filter for real-time token discovery
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white md:text-6xl">
            Signal-first Intel for
            <span className="block text-cyan-300">iamtrader.fun</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-white/70 md:text-base">
            One workspace for Discover, Smart Wallets, and Intel. Rank by market quality, search interest, and
            community voting. No pay-to-boost.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/discover"
              className="interactive-card inline-flex items-center gap-2 rounded-lg border border-cyan-300/50 bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200"
            >
              Open Discover
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/smart"
              className="interactive-card inline-flex items-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/20"
            >
              Open Smart Wallets
            </Link>
            <Link
              href="/intel"
              className="interactive-card inline-flex items-center gap-2 rounded-lg border border-white/20 bg-black/35 px-4 py-2 text-sm font-semibold text-white/85 hover:border-cyan-300/35 hover:text-cyan-200"
            >
              Open Intel
            </Link>
          </div>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-6xl px-4 md:px-8">
        <div className="grid gap-3 md:grid-cols-3">
          {corePillars.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                style={{ animationDelay: `${120 + idx * 90}ms` }}
                className="interactive-card load-in rounded-xl border border-cyan-400/20 bg-[#060b14]/80 p-5"
              >
                <Icon className="h-5 w-5 text-cyan-300" />
                <h2 className="mt-3 text-lg font-semibold text-white">{item.title}</h2>
                <p className="mt-2 text-sm text-white/65">{item.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="relative mx-auto mt-14 w-full max-w-6xl px-4 md:px-8">
        <div className="load-in rounded-2xl border border-cyan-400/20 bg-[#050912]/90 p-6 md:p-8" style={{ animationDelay: "360ms" }}>
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl">
              <h3 className="text-2xl font-semibold text-white">Three Steps to Work Fast</h3>
              <p className="mt-2 text-sm text-white/65">
                Keep your flow tight: discover candidates, validate signal quality, then act with clear context.
              </p>
            </div>
            <Link
              href="/api-docs"
              className="interactive-card inline-flex items-center gap-2 self-start rounded-lg border border-cyan-300/35 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/20"
            >
              API Docs
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {steps.map((step, idx) => (
              <div
                key={step.title}
                style={{ animationDelay: `${460 + idx * 90}ms` }}
                className="interactive-card load-in rounded-xl border border-white/10 bg-black/30 p-4"
              >
                <div className="text-xs font-medium text-cyan-300">STEP {idx + 1}</div>
                <div className="mt-1 text-base font-semibold text-white">{step.title}</div>
                <p className="mt-2 text-sm text-white/65">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto mt-14 w-full max-w-6xl px-4 pb-20 md:px-8">
        <div className="load-in mb-6 text-center" style={{ animationDelay: "720ms" }}>
          <h3 className="text-2xl font-semibold text-white">What iamtrader Checks</h3>
          <p className="mt-2 text-sm text-white/65">
            The app is a filter for attention, not a predictor. Signals are shown with confidence-aware guardrails.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {checks.map((item, idx) => (
            <div
              key={item}
              style={{ animationDelay: `${800 + idx * 60}ms` }}
              className="interactive-card load-in rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white/80"
            >
              {item}
            </div>
          ))}
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          <div className="interactive-card load-in rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4" style={{ animationDelay: "1120ms" }}>
            <ShieldCheck className="h-5 w-5 text-cyan-300" />
            <div className="mt-2 text-sm font-semibold text-white">Anti-spam voting</div>
            <p className="mt-1 text-xs text-white/70">Voting requires 0.001 SOL treasury fee to reduce spam.</p>
          </div>
          <div className="interactive-card load-in rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4" style={{ animationDelay: "1210ms" }}>
            <Bot className="h-5 w-5 text-cyan-300" />
            <div className="mt-2 text-sm font-semibold text-white">Agent-ready APIs</div>
            <p className="mt-1 text-xs text-white/70">Use `/api/discover`, `/api/token`, `/api/votes`, and docs endpoints.</p>
          </div>
          <div className="interactive-card load-in rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4" style={{ animationDelay: "1300ms" }}>
            <Radar className="h-5 w-5 text-cyan-300" />
            <div className="mt-2 text-sm font-semibold text-white">Live shared cache</div>
            <p className="mt-1 text-xs text-white/70">Worker-first refresh keeps data warm for all users.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

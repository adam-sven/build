import SubmitClient from "@/components/trencher/submit-client";
import { SUBMIT_FEE_LAMPORTS, TREASURY_PUBKEY } from "@/lib/trencher/public";

function fmtSol(lamports: number) {
  return (lamports / 1_000_000_000).toFixed(2);
}

export default function SubmitPage() {
  return (
    <main className="w-full px-3 py-8 md:px-6">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Submit a token</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/60">
              Add a Solana mint to the discovery candidate set. Submission is anti-spam gated and does not guarantee ranking.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="text-xs uppercase tracking-wide text-white/50">Submit fee</p>
              <p className="mt-1 text-lg font-semibold text-emerald-300">{fmtSol(SUBMIT_FEE_LAMPORTS)} SOL</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="text-xs uppercase tracking-wide text-white/50">Network</p>
              <p className="mt-1 text-lg font-semibold">Solana</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="text-xs uppercase tracking-wide text-white/50">Flow</p>
              <p className="mt-1 text-lg font-semibold">Sign + Transfer</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/75">How it works</h2>
            <ol className="mt-3 space-y-2 text-sm text-white/75">
              <li>1. Enter a valid Solana mint address and submit.</li>
              <li>2. Sign a wallet challenge message (proof of wallet ownership).</li>
              <li>3. Send exactly {fmtSol(SUBMIT_FEE_LAMPORTS)} SOL to treasury as anti-spam fee.</li>
              <li>4. Token is added to candidate discovery inputs and can appear in ranked feeds.</li>
            </ol>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/75">Important notes</h2>
            <ul className="mt-3 space-y-2 text-sm text-white/75">
              <li>• Submission does not buy rank placement.</li>
              <li>• Ranking is still based on vote/market/search quality signals.</li>
              <li>• Failed or reused fee transaction signatures are rejected.</li>
            </ul>
          </div>

          <SubmitClient />
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/75">Treasury</h2>
            <p className="mt-2 break-all text-xs text-white/60">{TREASURY_PUBKEY}</p>
            <a
              href={`https://solscan.io/account/${TREASURY_PUBKEY}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-xs text-cyan-300 hover:text-cyan-200"
            >
              View on Solscan
            </a>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/75">What to submit</h2>
            <p className="mt-2 text-sm text-white/70">
              Submit the base mint contract address, not a pool address and not a URL.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/75">After submission</h2>
            <p className="mt-2 text-sm text-white/70">
              You will be routed to Intel for the mint so you can inspect chart, market context, signals, and vote status.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

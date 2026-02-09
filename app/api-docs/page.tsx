"use client";

import { useEffect, useState } from "react";

type DocsPayload = {
  auth: { header: string; limit: string };
  endpoints: { method: string; path: string }[];
  curlExamples: { discover: string; token: string };
  errorCodes: string[];
};

export default function ApiDocsPage() {
  const [docs, setDocs] = useState<DocsPayload | null>(null);

  useEffect(() => {
    fetch("/api/ui/docs")
      .then((r) => r.json())
      .then((d) => setDocs(d));
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">API Docs</h1>
      <p className="mt-1 text-sm text-white/60">Agent-ready endpoints and schemas.</p>

      {!docs && <p className="mt-4 text-sm text-white/60">Loading docs...</p>}
      {docs && (
        <div className="mt-6 space-y-4">
          <section className="rounded-xl border border-white/10 bg-black/30 p-4">
            <h2 className="font-semibold">Authentication</h2>
            <p className="mt-2 text-sm text-white/70">Header: <code>X-API-Key</code> • Limit: {docs.auth.limit}</p>
          </section>

          <section className="rounded-xl border border-white/10 bg-black/30 p-4">
            <h2 className="font-semibold">Endpoints</h2>
            <ul className="mt-2 space-y-1 text-sm text-white/70">
              {docs.endpoints.map((e) => (
                <li key={`${e.method}-${e.path}`}><code>{e.method}</code> <code>{e.path}</code></li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-white/10 bg-black/30 p-4">
            <h2 className="font-semibold">Example curl</h2>
            <pre className="mt-2 overflow-x-auto text-xs text-white/70">{docs.curlExamples.discover}</pre>
            <pre className="mt-2 overflow-x-auto text-xs text-white/70">{docs.curlExamples.token}</pre>
          </section>

          <section className="rounded-xl border border-white/10 bg-black/30 p-4">
            <h2 className="font-semibold">Error codes</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {docs.errorCodes.map((c) => (
                <span key={c} className="rounded border border-white/15 px-2 py-1 text-xs text-white/70">{c}</span>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

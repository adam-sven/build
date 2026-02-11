import DiscoverClient from "@/components/trencher/discover-client";

export default function DiscoverPage() {
  return (
    <main className="w-full px-3 py-8 md:px-6">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Discover</h1>
        <p className="mt-1 text-sm text-white/60">Explainable discovery. No pay-to-boost.</p>
      </div>
      <DiscoverClient />
    </main>
  );
}

import IntelClient from "@/components/trencher/intel-client";

export default async function IntelPage({
  searchParams,
}: {
  searchParams: Promise<{ mint?: string }>;
}) {
  const params = await searchParams;
  const mint = params?.mint || "";

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <IntelClient initialMint={mint} />
    </main>
  );
}

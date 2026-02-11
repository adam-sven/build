import IntelClient from "@/components/trencher/intel-client";

export default async function IntelPage({
  searchParams,
}: {
  searchParams: Promise<{ mint?: string }>;
}) {
  const params = await searchParams;
  const mint = params?.mint || "";

  return (
    <main className="w-full px-3 py-8 md:px-6">
      <IntelClient initialMint={mint} />
    </main>
  );
}

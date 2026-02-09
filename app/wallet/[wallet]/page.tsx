import WalletProfileClient from "@/components/trencher/wallet-profile-client";

export default async function WalletProfilePage({
  params,
}: {
  params: Promise<{ wallet: string }>;
}) {
  const { wallet } = await params;
  return <WalletProfileClient wallet={wallet} />;
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { RevenueSummary } from "@/components/revenue-summary";

export const metadata = { title: "収益管理" };

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; status?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/revenue");
  }
  const sp = await searchParams;
  const filter = {
    from: sp.from,
    to: sp.to,
    status: sp.status === "confirmed" ? "confirmed" : "all",
  } as const;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">収益管理</h1>
        <Link href="/dashboard" className="text-sm underline">
          マイ記事
        </Link>
      </div>
      <RevenueSummary userId={session.user.id} filter={filter} />
    </main>
  );
}

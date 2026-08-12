import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatXym } from "@/lib/format";
import { absoluteUrl } from "@/lib/site";
import { getOwnedStampIds } from "@/lib/stamps";
import { StampPurchaseButton } from "@/components/stamp/stamp-purchase-button";
import { ShareButtons } from "@/components/share-buttons";

async function getStamp(id: string) {
  return prisma.stamp.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      imageUrl: true,
      price: true,
      published: true,
      authorId: true,
      author: { select: { id: true, displayName: true, xymAddress: true } },
      _count: { select: { placements: true } },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const stamp = await getStamp(id);
  // 非公開スタンプはメタ情報を出さない（宣伝URLは公開スタンプのみ）。
  if (!stamp || !stamp.published) return { title: "スタンプ" };

  const title = `${stamp.name}｜Harbor スタンプ`;
  const price = Number(stamp.price);
  const description =
    (stamp.description?.trim() ? `${stamp.description.trim()} / ` : "") +
    `${stamp.author.displayName ?? "作者"} さんのスタンプ（${
      price === 0 ? "無料" : `${formatXym(price)} XYM`
    }）。記事やコミュニティに貼れます。`;
  // OG画像はスタンプ画像そのもの（SNSでカード表示される）。絶対URL化。
  const images = [absoluteUrl(stamp.imageUrl)];
  const url = absoluteUrl(`/stamps/${id}`);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images,
    },
  };
}

export default async function StampDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const currentUserId = session?.user?.id ?? null;

  const stamp = await getStamp(id);
  if (!stamp) notFound();

  const isOwn = currentUserId != null && stamp.author.id === currentUserId;
  // 非公開スタンプは作者本人のみ閲覧可（宣伝URLとしては公開が前提）。
  if (!stamp.published && !isOwn) notFound();

  const ownedIds = await getOwnedStampIds(currentUserId);
  const owned = ownedIds.has(stamp.id);
  const price = Number(stamp.price);

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-10">
      <nav className="mb-6 text-sm">
        <Link href="/stamps" className="text-gray-500 hover:underline dark:text-gray-400">
          ← スタンプショップへ
        </Link>
      </nav>

      <div className="flex flex-col items-center gap-4 rounded-xl border border-gray-200 p-6 text-center dark:border-gray-800">
        {!stamp.published && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            非公開（あなただけに表示中）
          </span>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={stamp.imageUrl}
          alt={stamp.name}
          style={{ width: 240, height: 240 }}
          className="rounded-lg bg-gray-50 object-contain dark:bg-gray-900"
        />
        <h1 className="text-xl font-bold">{stamp.name}</h1>
        {stamp.description && (
          <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">
            {stamp.description}
          </p>
        )}
        <Link
          href={`/users/${stamp.author.id}`}
          className="text-sm text-gray-500 hover:underline dark:text-gray-400"
        >
          作者: {stamp.author.displayName ?? "（無名）"}
        </Link>
        <p className="text-lg font-semibold">
          {price === 0 ? "無料（0 XYM）" : `${formatXym(price)} XYM`}
        </p>

        <div className="mt-1">
          {isOwn ? (
            <span className="text-sm text-gray-400">自分のスタンプです</span>
          ) : owned ? (
            <span className="rounded-md bg-green-50 px-3 py-1.5 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
              ✓ 所持済み
            </span>
          ) : currentUserId == null ? (
            <Link
              href={`/login?callbackUrl=/stamps/${stamp.id}`}
              className="text-sm text-amber-600 underline dark:text-amber-400"
            >
              ログインして購入
            </Link>
          ) : stamp.author.xymAddress ? (
            <StampPurchaseButton
              stampId={stamp.id}
              name={stamp.name}
              authorName={stamp.author.displayName ?? "（無名）"}
              sellerAddress={stamp.author.xymAddress}
              price={price}
            />
          ) : (
            <span className="text-sm text-gray-400">
              作者が受取アドレスを登録していません
            </span>
          )}
        </div>

        <p className="mt-2 text-xs text-gray-400">
          このスタンプは {stamp._count.placements} 回使われています
        </p>

        {stamp.published && (
          <div className="mt-2 w-full border-t border-gray-100 pt-3 dark:border-gray-800">
            <ShareButtons
              url={absoluteUrl(`/stamps/${stamp.id}`)}
              title={`Harbor のスタンプ「${stamp.name}」`}
            />
          </div>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-gray-400">
        購入すると記事やコミュニティチャットに貼れます。
        <Link href={`/stamps?author=${stamp.author.id}`} className="ml-1 underline">
          この作者の他のスタンプ →
        </Link>
      </p>
    </main>
  );
}

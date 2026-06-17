import "server-only";
import "@/lib/wallet/polyfill";
import { Address } from "symbol-sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getCurrencyMosaicId,
  getNetworkType,
  nodeFetch,
} from "@/lib/wallet/symbol";
import { fetchXymJpyRate } from "@/lib/rates";
import { decodeMessage } from "@/lib/tips/poller";
import { notify } from "@/lib/notifications";

// 販売者アドレス宛の確定送金を走査し、"nagexym:buy:<postId>" マーカーの購入を
// 記録/確定する（クライアント側の記録が失敗しても購入を救済する照合処理）。

const TRANSFER_TYPE = 16724;
const BUY_MARKER = /nagexym:buy:([A-Za-z0-9_-]+)/;

type RestTransaction = {
  meta?: { hash?: string };
  transaction?: {
    signerPublicKey?: string;
    message?: string | { payload?: string };
    mosaics?: { id: string; amount: string }[];
  };
};

type ParsedBuy = {
  txHash: string;
  postId: string;
  buyerAddress: string;
  amountXym: number;
};

function parseBuyTransaction(
  item: RestTransaction,
  currencyMosaicId: string,
  networkType: number
): ParsedBuy | null {
  const tx = item.transaction;
  const hash = item.meta?.hash;
  if (!tx || !hash || !tx.signerPublicKey) return null;

  const marker = BUY_MARKER.exec(decodeMessage(tx.message));
  if (!marker) return null;
  const postId = marker[1];

  const mosaic = (tx.mosaics ?? []).find(
    (m) => m.id.toUpperCase() === currencyMosaicId
  );
  if (!mosaic) return null;
  const amountXym = Number(mosaic.amount) / 1_000_000;

  const buyerAddress = Address.createFromPublicKey(
    tx.signerPublicKey,
    networkType
  ).plain();

  return { txHash: hash.toUpperCase(), postId, buyerAddress, amountXym };
}

export type PurchasePollResult = {
  scanned: number;
  confirmed: number;
  created: number;
};

/** 販売者アドレス宛の確定送金から購入を記録/確定する。 */
export async function pollAddressPurchases(
  sellerAddress: string
): Promise<PurchasePollResult> {
  const currencyId = await getCurrencyMosaicId();
  const networkType = getNetworkType();
  const res = await nodeFetch(
    `/transactions/confirmed?recipientAddress=${sellerAddress}&type=${TRANSFER_TYPE}&order=desc&pageSize=100`
  );
  if (!res.ok) throw new Error("トランザクションの取得に失敗しました");
  const data = (await res.json()) as { data?: RestTransaction[] };
  const items = data.data ?? [];

  const result: PurchasePollResult = { scanned: items.length, confirmed: 0, created: 0 };
  const jpyRate = items.length > 0 ? await fetchXymJpyRate() : null;
  const jpyRateDec = jpyRate != null ? new Prisma.Decimal(jpyRate) : null;

  for (const item of items) {
    const parsed = parseBuyTransaction(item, currencyId, networkType);
    if (!parsed) continue;

    // 記事が販売中・販売者アドレス一致・金額が価格以上のもののみ採用。
    const post = await prisma.post.findUnique({
      where: { id: parsed.postId },
      select: {
        id: true,
        title: true,
        paid: true,
        priceAmount: true,
        priceCurrency: true,
        sellerAddress: true,
        authorId: true,
      },
    });
    if (
      !post ||
      !post.paid ||
      !post.priceAmount ||
      post.sellerAddress !== sellerAddress
    )
      continue;
    if (parsed.amountXym + 1e-9 < Number(post.priceAmount)) continue;

    // 購入者ユーザーを送金元アドレスから推定（無ければアクセス付与不可だが記録は残す）。
    const buyer = await prisma.user.findFirst({
      where: { xymAddress: parsed.buyerAddress },
      select: { id: true, displayName: true },
    });

    const existing = await prisma.purchase.findUnique({
      where: { txHash: parsed.txHash },
      select: { id: true, confirmed: true },
    });

    if (existing) {
      if (!existing.confirmed) {
        await prisma.purchase.update({
          where: { txHash: parsed.txHash },
          data: { confirmed: true },
        });
        result.confirmed += 1;
      }
    } else {
      try {
        await prisma.purchase.create({
          data: {
            postId: post.id,
            buyerUserId: buyer?.id ?? null,
            buyerAddress: parsed.buyerAddress,
            sellerAddress,
            amount: new Prisma.Decimal(parsed.amountXym),
            currency: post.priceCurrency ?? "XYM",
            txHash: parsed.txHash,
            confirmed: true,
            jpyRate: jpyRateDec,
          },
        });
        result.created += 1;
        result.confirmed += 1;
        if (post.authorId) {
          await notify({
            userId: post.authorId,
            type: "purchase",
            actorId: buyer?.id ?? null,
            actorName: buyer?.displayName ?? null,
            postId: post.id,
            postTitle: post.title,
            amount: parsed.amountXym,
            currency: post.priceCurrency ?? "XYM",
          });
        }
      } catch (e) {
        if (
          !(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        ) {
          throw e;
        }
      }
    }
  }

  return result;
}

/** 販売中記事の販売者アドレス全件をポーリングする（cron 用）。 */
export async function pollAllPurchases(): Promise<PurchasePollResult> {
  const posts = await prisma.post.findMany({
    where: { paid: true, sellerAddress: { not: null } },
    select: { sellerAddress: true },
    distinct: ["sellerAddress"],
  });
  const total: PurchasePollResult = { scanned: 0, confirmed: 0, created: 0 };
  for (const p of posts) {
    if (!p.sellerAddress) continue;
    try {
      const r = await pollAddressPurchases(p.sellerAddress);
      total.scanned += r.scanned;
      total.confirmed += r.confirmed;
      total.created += r.created;
    } catch (e) {
      console.error("pollAllPurchases error for", p.sellerAddress, e);
    }
  }
  return total;
}

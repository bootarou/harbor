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
import { notify } from "@/lib/notifications";

// Symbol ノードを確定済みトランザクションでポーリングし、
// メッセージの "nagexym:tip:<postId>" マーカーで記事へ紐付けて Tip を確定する。

const TRANSFER_TYPE = 16724; // 0x4154 TransferTransaction
const TIP_MARKER = /nagexym:tip:([A-Za-z0-9_-]+)/;

type RestTransaction = {
  meta?: { hash?: string };
  transaction?: {
    signerPublicKey?: string;
    message?: string | { payload?: string };
    mosaics?: { id: string; amount: string }[];
  };
};

/** Symbol の平文メッセージ（先頭 1 バイト 0x00 + UTF-8）をデコードする。 */
export function decodeMessage(
  raw: string | { payload?: string } | undefined
): string {
  const value = typeof raw === "string" ? raw : raw?.payload ?? "";
  if (!value) return "";
  // 平文メッセージは先頭バイト 0x00 + UTF-8。16進文字列ならデコードする。
  if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
    if (value.slice(0, 2) === "00") {
      try {
        return Buffer.from(value.slice(2), "hex").toString("utf8");
      } catch {
        // fall through
      }
    }
  }
  return value;
}

export type ParsedTip = {
  txHash: string;
  postId: string;
  fromAddress: string;
  amountXym: number;
};

/** REST のトランザクション 1 件を投げ銭としてパースする（純粋関数）。 */
export function parseTipTransaction(
  item: RestTransaction,
  currencyMosaicId: string,
  networkType: number
): ParsedTip | null {
  const tx = item.transaction;
  const hash = item.meta?.hash;
  if (!tx || !hash || !tx.signerPublicKey) return null;

  const message = decodeMessage(tx.message);
  const marker = TIP_MARKER.exec(message);
  if (!marker) return null;
  const postId = marker[1];

  const mosaic = (tx.mosaics ?? []).find(
    (m) => m.id.toUpperCase() === currencyMosaicId
  );
  if (!mosaic) return null;
  const amountXym = Number(mosaic.amount) / 1_000_000;

  const fromAddress = Address.createFromPublicKey(
    tx.signerPublicKey,
    networkType
  ).plain();

  return { txHash: hash.toUpperCase(), postId, fromAddress, amountXym };
}

export type PollResult = { scanned: number; confirmed: number; created: number };

// 複数アドレスを連続でポーリングする際の間隔（ms）。
// ノードは概ね 250ms 未満の連打を 429 (Too Many Requests) で弾くため、余裕をもって 500ms あける。
export const POLL_ADDRESS_INTERVAL_MS = 500;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 指定アドレス宛の確定済み送金を取得し、該当する投げ銭を確定する。 */
export async function pollAddressTips(address: string): Promise<PollResult> {
  const currencyId = await getCurrencyMosaicId();
  const networkType = getNetworkType();
  const res = await nodeFetch(
    `/transactions/confirmed?recipientAddress=${address}&type=${TRANSFER_TYPE}&order=desc&pageSize=100`
  );
  if (!res.ok) {
    throw new Error("トランザクションの取得に失敗しました");
  }
  const data = (await res.json()) as { data?: RestTransaction[] };
  const items = data.data ?? [];

  const result: PollResult = { scanned: items.length, confirmed: 0, created: 0 };
  const jpyRate = items.length > 0 ? await fetchXymJpyRate() : null;
  const jpyRateDec = jpyRate != null ? new Prisma.Decimal(jpyRate) : null;

  for (const item of items) {
    const parsed = parseTipTransaction(item, currencyId, networkType);
    if (!parsed) continue;

    // マーカーの postId が実在し、かつ宛先がその記事著者のアドレスと一致するもののみ採用。
    const post = await prisma.post.findUnique({
      where: { id: parsed.postId },
      select: {
        id: true,
        title: true,
        author: { select: { id: true, xymAddress: true } },
      },
    });
    if (!post || post.author.xymAddress !== address) continue;

    // 送信元アドレスからユーザーを推定（履歴表示用、無ければ null）。
    const fromUser = await prisma.user.findFirst({
      where: { xymAddress: parsed.fromAddress },
      select: { id: true },
    });

    const existing = await prisma.tip.findUnique({
      where: { txHash: parsed.txHash },
      select: { id: true, confirmed: true, jpyRate: true },
    });

    if (existing) {
      if (!existing.confirmed) {
        await prisma.tip.update({
          where: { txHash: parsed.txHash },
          data: {
            confirmed: true,
            confirmedAt: new Date(),
            jpyRate: existing.jpyRate ?? jpyRateDec,
          },
        });
        result.confirmed += 1;
        // 確定（着金確認）のタイミングで著者へ通知。
        await notify({
          userId: post.author.id,
          type: "tip_received",
          postId: post.id,
          postTitle: post.title,
          amount: parsed.amountXym,
          currency: "XYM",
        });
      }
    } else {
      try {
        await prisma.tip.create({
          data: {
            postId: post.id,
            fromAddress: parsed.fromAddress,
            toAddress: address,
            amount: new Prisma.Decimal(parsed.amountXym),
            txHash: parsed.txHash,
            fromUserId: fromUser?.id ?? null,
            confirmed: true,
            jpyRate: jpyRateDec,
          },
        });
        result.created += 1;
        result.confirmed += 1;
        await notify({
          userId: post.author.id,
          type: "tip_received",
          postId: post.id,
          postTitle: post.title,
          amount: parsed.amountXym,
          currency: "XYM",
        });
      } catch (e) {
        // 別のポーリング/クライアント記録と競合（txHash 重複）した場合は
        // 既に記録済みなので無視（確定済みへの更新は次回ポーリングで収束）。
        if (
          !(
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === "P2002"
          )
        ) {
          throw e;
        }
      }
    }
  }

  return result;
}

/** xymAddress を登録している全著者についてポーリングする（cron 用）。 */
export async function pollAllTips(): Promise<PollResult> {
  const users = await prisma.user.findMany({
    where: { xymAddress: { not: null } },
    select: { xymAddress: true },
  });
  const total: PollResult = { scanned: 0, confirmed: 0, created: 0 };
  let first = true;
  for (const u of users) {
    if (!u.xymAddress) continue;
    // 連続ポーリングはノードの 429 を避けるためアドレス間に間隔をあける。
    if (!first) await sleep(POLL_ADDRESS_INTERVAL_MS);
    first = false;
    try {
      const r = await pollAddressTips(u.xymAddress);
      total.scanned += r.scanned;
      total.confirmed += r.confirmed;
      total.created += r.created;
    } catch (e) {
      console.error("pollAllTips error for", u.xymAddress, e);
    }
  }
  return total;
}

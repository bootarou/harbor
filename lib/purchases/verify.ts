import "server-only";
import "@/lib/wallet/polyfill";
import { Address } from "symbol-sdk";
import {
  getCurrencyMosaicId,
  getNetworkType,
  getNodeUrl,
} from "@/lib/wallet/symbol";
import { decodeMessage } from "@/lib/tips/poller";

// 有料記事の購入トランザクションをノードで検証する（運営は送金を預からないため、
// クライアント申告ではなくオンチェーンの事実で解除可否を判断する）。

type RestTx = {
  meta?: { hash?: string };
  transaction?: {
    signerPublicKey?: string;
    recipientAddress?: string; // hex エンコード
    message?: string | { payload?: string };
    mosaics?: { id: string; amount: string }[];
  };
};

export type VerifiedPurchase = {
  buyerAddress: string;
  amount: number;
  confirmed: boolean;
};

async function fetchTxByHash(
  hash: string
): Promise<{ tx: RestTx; confirmed: boolean } | null> {
  const node = getNodeUrl();
  for (const group of ["confirmed", "unconfirmed"] as const) {
    const res = await fetch(`${node}/transactions/${group}/${hash}`);
    if (res.ok) {
      const tx = (await res.json()) as RestTx;
      return { tx, confirmed: group === "confirmed" };
    }
  }
  return null;
}

function recipientPlain(recipientHex: string | undefined): string | null {
  if (!recipientHex) return null;
  try {
    return Address.createFromEncoded(recipientHex).plain();
  } catch {
    // 既に plain 形式で返るノード実装にも一応対応
    return /^[A-Z2-7]{39}$/.test(recipientHex) ? recipientHex : null;
  }
}

export type VerifiedTransfer = {
  senderAddress: string;
  amount: number;
  confirmed: boolean;
};

/**
 * 送金TXを汎用検証する。条件を満たさなければ null。
 * - メッセージに requiredMarker を含む
 * - 送金先が recipientAddress
 * - 許可モザイクで金額が minAmountXym 以上
 */
export async function verifyTransferByHash(args: {
  txHash: string;
  requiredMarker: string;
  recipientAddress: string;
  minAmountXym: number;
}): Promise<VerifiedTransfer | null> {
  const found = await fetchTxByHash(args.txHash);
  if (!found) return null;

  const tx = found.tx.transaction;
  if (!tx || !tx.signerPublicKey) return null;

  const message = decodeMessage(tx.message);
  if (!message.includes(args.requiredMarker)) return null;

  const recipient = recipientPlain(tx.recipientAddress);
  if (!recipient || recipient !== args.recipientAddress) return null;

  const currencyId = await getCurrencyMosaicId();
  const mosaic = (tx.mosaics ?? []).find(
    (m) => m.id.toUpperCase() === currencyId
  );
  if (!mosaic) return null;
  const amount = Number(mosaic.amount) / 1_000_000;
  if (amount + 1e-9 < args.minAmountXym) return null;

  const senderAddress = Address.createFromPublicKey(
    tx.signerPublicKey,
    getNetworkType()
  ).plain();

  return { senderAddress, amount, confirmed: found.confirmed };
}

/**
 * 購入TXを検証する。
 */
export async function verifyPurchaseTx(args: {
  txHash: string;
  postId: string;
  sellerAddress: string;
  priceAmount: number;
}): Promise<VerifiedPurchase | null> {
  const r = await verifyTransferByHash({
    txHash: args.txHash,
    requiredMarker: `nagexym:buy:${args.postId}`,
    recipientAddress: args.sellerAddress,
    minAmountXym: args.priceAmount,
  });
  if (!r) return null;
  return { buyerAddress: r.senderAddress, amount: r.amount, confirmed: r.confirmed };
}

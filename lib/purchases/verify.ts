import "server-only";
import "@/lib/wallet/polyfill";
import { Address } from "symbol-sdk";
import {
  getCurrencyMosaicId,
  getNetworkType,
  nodeFetch,
} from "@/lib/wallet/symbol";
import { decodeMessage } from "@/lib/tips/poller";

// 送金トランザクションをノードで検証する（運営は送金を預からないため、
// クライアント申告ではなくオンチェーンの事実で解除可否を判断する）。
// アナウンス直後はノード未反映のことがあるため、短時間リトライし、
// 「未検出（確認中）」と「内容不一致（失敗）」を区別して返す。

type RestTx = {
  meta?: { hash?: string };
  transaction?: {
    signerPublicKey?: string;
    recipientAddress?: string; // hex エンコード
    message?: string | { payload?: string };
    mosaics?: { id: string; amount: string }[];
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchTxByHashOnce(
  hash: string
): Promise<{ tx: RestTx; confirmed: boolean } | null> {
  for (const group of ["confirmed", "unconfirmed"] as const) {
    const res = await nodeFetch(`/transactions/${group}/${hash}`);
    if (res.ok) {
      const tx = (await res.json()) as RestTx;
      return { tx, confirmed: group === "confirmed" };
    }
  }
  return null;
}

// 未検出のときは指定回数までリトライ（伝播待ち）。
async function fetchTxByHash(
  hash: string,
  retries = 3,
  delayMs = 1500
): Promise<{ tx: RestTx; confirmed: boolean } | null> {
  for (let i = 0; i <= retries; i++) {
    const found = await fetchTxByHashOnce(hash);
    if (found) return found;
    if (i < retries) await sleep(delayMs);
  }
  return null;
}

function recipientPlain(recipientHex: string | undefined): string | null {
  if (!recipientHex) return null;
  try {
    return Address.createFromEncoded(recipientHex).plain();
  } catch {
    return /^[A-Z2-7]{39}$/.test(recipientHex) ? recipientHex : null;
  }
}

export type TransferCheck =
  | { status: "ok"; senderAddress: string; amount: number; confirmed: boolean }
  | { status: "invalid"; reason: string }
  | { status: "notfound" };

/**
 * 送金TXを検証して状態を返す。
 * - notfound: ノードにまだ無い（伝播待ち＝確認中。失敗扱いにしない）
 * - invalid: 反映されているが条件（マーカー/宛先/額/署名者）を満たさない
 * - ok: 条件を満たす（confirmed で確定/未確定を区別）
 */
export async function checkTransferByHash(args: {
  txHash: string;
  requiredMarker: string;
  recipientAddress: string;
  minAmountXym: number;
  retries?: number;
}): Promise<TransferCheck> {
  const found = await fetchTxByHash(args.txHash, args.retries ?? 3);
  if (!found) return { status: "notfound" };

  const tx = found.tx.transaction;
  if (!tx || !tx.signerPublicKey) return { status: "invalid", reason: "tx形式" };

  const message = decodeMessage(tx.message);
  if (!message.includes(args.requiredMarker))
    return { status: "invalid", reason: "マーカー不一致" };

  const recipient = recipientPlain(tx.recipientAddress);
  if (!recipient || recipient !== args.recipientAddress)
    return { status: "invalid", reason: "送金先不一致" };

  const currencyId = await getCurrencyMosaicId();
  const mosaic = (tx.mosaics ?? []).find((m) => m.id.toUpperCase() === currencyId);
  if (!mosaic) return { status: "invalid", reason: "通貨不一致" };
  const amount = Number(mosaic.amount) / 1_000_000;
  if (amount + 1e-9 < args.minAmountXym)
    return { status: "invalid", reason: "金額不足" };

  const senderAddress = Address.createFromPublicKey(
    tx.signerPublicKey,
    getNetworkType()
  ).plain();

  return { status: "ok", senderAddress, amount, confirmed: found.confirmed };
}

export type VerifiedTransfer = {
  senderAddress: string;
  amount: number;
  confirmed: boolean;
};

/** 後方互換: 条件を満たせば値、それ以外（notfound/invalid）は null。 */
export async function verifyTransferByHash(args: {
  txHash: string;
  requiredMarker: string;
  recipientAddress: string;
  minAmountXym: number;
}): Promise<VerifiedTransfer | null> {
  const r = await checkTransferByHash(args);
  if (r.status !== "ok") return null;
  return { senderAddress: r.senderAddress, amount: r.amount, confirmed: r.confirmed };
}

export type PurchaseCheck =
  | { status: "ok"; buyerAddress: string; amount: number; confirmed: boolean }
  | { status: "invalid"; reason: string }
  | { status: "notfound" };

/** 購入TXを検証して状態を返す。 */
export async function checkPurchaseTx(args: {
  txHash: string;
  postId: string;
  sellerAddress: string;
  priceAmount: number;
  retries?: number;
}): Promise<PurchaseCheck> {
  const r = await checkTransferByHash({
    txHash: args.txHash,
    requiredMarker: `nagexym:buy:${args.postId}`,
    recipientAddress: args.sellerAddress,
    minAmountXym: args.priceAmount,
    retries: args.retries,
  });
  if (r.status === "ok")
    return { status: "ok", buyerAddress: r.senderAddress, amount: r.amount, confirmed: r.confirmed };
  return r;
}

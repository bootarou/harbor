import "./polyfill"; // Buffer を symbol import より前に用意する
import {
  Account,
  Address,
  Deadline,
  Mosaic,
  MosaicId,
  PlainMessage,
  TransferTransaction,
  UInt64,
} from "symbol-sdk";
import { getNetworkType, getNodeUrl } from "./symbol";

// 投げ銭の送金トランザクション作成・署名・アナウンス（すべてクライアントで実行）。
// 秘密鍵は引数で受け取り、メモリ上でのみ使用する（保存・送信しない）。

export type NetworkParams = {
  generationHash: string;
  epochAdjustment: number; // seconds
  currencyMosaicId: string; // hex (no 0x / apostrophes)
};

const XYM_DIVISIBILITY = 1_000_000;
const FEE_MULTIPLIER = 100;

// メッセージに postId マーカーを入れ、着金を記事へ紐付けられるようにする。
export function buildTipMessage(postId: string): string {
  return `nagexym:tip:${postId}`;
}

// 有料記事の購入用マーカー。
export function buildBuyMessage(postId: string): string {
  return `nagexym:buy:${postId}`;
}

// Thanks（投稿者→読者の感謝送金）用マーカー。
export function buildThanksMessage(reactionId: string): string {
  return `nagexym:thanks:${reactionId}`;
}

let cachedParams: NetworkParams | null = null;

export async function fetchNetworkParams(): Promise<NetworkParams> {
  if (cachedParams) {
    return cachedParams;
  }
  const node = getNodeUrl();
  const [nodeInfoRes, propsRes] = await Promise.all([
    fetch(`${node}/node/info`),
    fetch(`${node}/network/properties`),
  ]);
  if (!nodeInfoRes.ok || !propsRes.ok) {
    throw new Error("ネットワーク情報の取得に失敗しました");
  }
  const nodeInfo = (await nodeInfoRes.json()) as {
    networkGenerationHashSeed?: string;
  };
  const props = (await propsRes.json()) as {
    network?: { epochAdjustment?: string };
    chain?: { currencyMosaicId?: string };
  };

  const generationHash = nodeInfo.networkGenerationHashSeed ?? "";
  const epochAdjustment = Number.parseInt(
    (props.network?.epochAdjustment ?? "0").replace(/s$/, ""),
    10
  );
  const currencyMosaicId = (props.chain?.currencyMosaicId ?? "")
    .replace(/^0x/i, "")
    .replace(/'/g, "")
    .toUpperCase();

  if (!generationHash || !epochAdjustment || !currencyMosaicId) {
    throw new Error("ネットワーク情報が不完全です");
  }
  cachedParams = { generationHash, epochAdjustment, currencyMosaicId };
  return cachedParams;
}

export type SignedTip = {
  payload: string;
  hash: string;
  maxFee: string; // XYM
};

/**
 * 投げ銭トランザクションを作成・署名する（ネットワーク非依存・純粋関数）。
 */
export function buildSignedTip(args: {
  privateKey: string;
  recipientAddress: string;
  amountXym: number;
  message: string;
  params: NetworkParams;
}): SignedTip {
  const networkType = getNetworkType();
  const { params } = args;

  const deadline = Deadline.create(params.epochAdjustment);
  const amountMicro = Math.round(args.amountXym * XYM_DIVISIBILITY);
  const mosaic = new Mosaic(
    new MosaicId(params.currencyMosaicId),
    UInt64.fromUint(amountMicro)
  );

  const unsigned = TransferTransaction.create(
    deadline,
    Address.createFromRawAddress(args.recipientAddress),
    [mosaic],
    PlainMessage.create(args.message),
    networkType
  ).setMaxFee(FEE_MULTIPLIER) as TransferTransaction;

  const account = Account.createFromPrivateKey(args.privateKey, networkType);
  const signed = account.sign(unsigned, params.generationHash);

  return {
    payload: signed.payload,
    hash: signed.hash,
    maxFee: (unsigned.maxFee.compact() / XYM_DIVISIBILITY).toString(),
  };
}

/** 署名済みトランザクションをノードへアナウンスする。 */
export async function announceTransaction(payload: string): Promise<void> {
  const res = await fetch(`${getNodeUrl()}/transactions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) {
    throw new Error("トランザクションのアナウンスに失敗しました");
  }
}

/**
 * 投げ銭の一連の処理: ネットワーク情報取得 → 署名 → アナウンス。
 * 返り値の hash で記事への記録に用いる。
 */
export async function sendTip(args: {
  privateKey: string;
  recipientAddress: string;
  amountXym: number;
  postId: string;
}): Promise<SignedTip> {
  const params = await fetchNetworkParams();
  const signed = buildSignedTip({
    privateKey: args.privateKey,
    recipientAddress: args.recipientAddress,
    amountXym: args.amountXym,
    message: buildTipMessage(args.postId),
    params,
  });
  await announceTransaction(signed.payload);
  return signed;
}

/**
 * Thanks 送金: リアクションした読者の受取アドレスへ固定額を送る。
 */
export async function sendThanks(args: {
  privateKey: string;
  recipientAddress: string;
  amountXym: number;
  reactionId: string;
}): Promise<SignedTip> {
  const params = await fetchNetworkParams();
  const signed = buildSignedTip({
    privateKey: args.privateKey,
    recipientAddress: args.recipientAddress,
    amountXym: args.amountXym,
    message: buildThanksMessage(args.reactionId),
    params,
  });
  await announceTransaction(signed.payload);
  return signed;
}

/**
 * 有料記事の購入送金: 販売者アドレスへ価格分を送り、購入マーカーを付与する。
 */
export async function sendPurchase(args: {
  privateKey: string;
  recipientAddress: string;
  amountXym: number;
  postId: string;
}): Promise<SignedTip> {
  const params = await fetchNetworkParams();
  const signed = buildSignedTip({
    privateKey: args.privateKey,
    recipientAddress: args.recipientAddress,
    amountXym: args.amountXym,
    message: buildBuyMessage(args.postId),
    params,
  });
  await announceTransaction(signed.payload);
  return signed;
}

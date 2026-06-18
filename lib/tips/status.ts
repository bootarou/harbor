// 投げ銭の表示ステータス判定（クライアント/サーバー共用・依存なし）。
//
// Symbol のトランザクションは deadline（既定 約2時間）を過ぎるとブロックに取り込まれず、
// 二度と確定し得ない。確認中のまま放置すると同期のたびにノードへ問い合わせ続けてしまうため、
// 余裕をもって 3 時間を「確認中 → 期限切れ（失敗）」の閾値とする。
// この時間を過ぎた未確定 Tip は同期対象から外し（リクエストを止める）、表示も「期限切れ」にする。
export const TIP_PENDING_EXPIRY_MS = 3 * 60 * 60 * 1000;

export type TipStatus = "confirmed" | "pending" | "expired";

export function tipStatus(tip: { confirmed: boolean; createdAt: Date }): TipStatus {
  if (tip.confirmed) return "confirmed";
  if (Date.now() - tip.createdAt.getTime() > TIP_PENDING_EXPIRY_MS) return "expired";
  return "pending";
}

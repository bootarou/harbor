"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sleep, POLL_ADDRESS_INTERVAL_MS } from "@/lib/tips/poller";
import { TIP_PENDING_EXPIRY_MS } from "@/lib/tips/status";
import { checkTransferByHash } from "@/lib/purchases/verify";
import { fetchXymJpyRate } from "@/lib/rates";
import { notify } from "@/lib/notifications";

export type SyncTipsState = {
  message?: string;
  error?: string;
};

const TIP_MIN_XYM = 0.1;

// 送信者本人の「確認中」投げ銭を txHash 単位でオンチェーン確認して確定する。
//
// 設計: 確認は「自分が送った（fromUserId=自分）かつ未確定」の Tip だけを対象にし、
// その txHash を個別に検証する。
// - 送った本人が「ちゃんと届いたか」を確認する自然な操作に対応（受信側は確定時に通知が飛ぶ）。
// - 他人の Tip を巻き込まない（アドレス起点のような副作用がない）。
// - 自分の未確認 Tip が捌けるとリクエストは発生しなくなる（止まる）。
// 連続確認時はノードの 429 を避けるため txHash 間に間隔をあける。
// なお「DB 未記録のオンチェーン Tip の発見」はアドレス起点の cron(poll-tips) が担う。
export async function syncMyTips(
  // useActionState のシグネチャ要件のため受け取るが未使用。
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: SyncTipsState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData
): Promise<SyncTipsState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "認証が必要です" };
  }
  const me = session.user.id;

  // 自分が送った「確認中」の投げ銭のみを対象に、txHash で個別確認する。
  // ただし期限切れ（作成から TIP_PENDING_EXPIRY_MS 超）の未確定は確定し得ないため対象外にする。
  // → 失効した Tx を毎回問い合わせ続けない（未確認が捌ければリクエストは止まる）。
  const since = new Date(Date.now() - TIP_PENDING_EXPIRY_MS);
  const pending = await prisma.tip.findMany({
    where: { fromUserId: me, confirmed: false, createdAt: { gte: since } },
    select: {
      id: true,
      txHash: true,
      postId: true,
      toAddress: true,
      jpyRate: true,
      post: { select: { id: true, title: true, authorId: true } },
    },
  });

  if (pending.length === 0) {
    return { message: "確認中の投げ銭はありません" };
  }

  try {
    const jpyRate = await fetchXymJpyRate();
    const jpyRateDec = jpyRate != null ? new Prisma.Decimal(jpyRate) : null;

    let confirmed = 0;
    let first = true;
    for (const tip of pending) {
      // 連続確認はノードの 429 を避けるため txHash 間に間隔をあける。
      if (!first) await sleep(POLL_ADDRESS_INTERVAL_MS);
      first = false;

      const r = await checkTransferByHash({
        txHash: tip.txHash,
        requiredMarker: `nagexym:tip:${tip.postId}`,
        recipientAddress: tip.toAddress,
        minAmountXym: TIP_MIN_XYM,
        retries: 1, // 確認は単発でよい（未反映なら次回の同期で再確認）
      });
      // まだ確定していない / ノードに無い場合はスキップ（次回再確認）。
      if (r.status !== "ok" || !r.confirmed) continue;

      // confirmed=false の行のみ更新（同時実行や cron との二重確定・二重通知を防ぐ）。
      const updated = await prisma.tip.updateMany({
        where: { id: tip.id, confirmed: false },
        data: {
          confirmed: true,
          confirmedAt: new Date(),
          jpyRate: tip.jpyRate ?? jpyRateDec,
        },
      });
      if (updated.count === 0) continue;

      confirmed += 1;
      // 確定（着金確認）のタイミングで著者へ通知。
      await notify({
        userId: tip.post.authorId,
        type: "tip_received",
        postId: tip.post.id,
        postTitle: tip.post.title,
        amount: r.amount,
        currency: "XYM",
      });
    }

    revalidatePath("/tips");
    if (confirmed > 0) {
      return {
        message: `${confirmed} 件の投げ銭の着金を確認しました（確認 ${pending.length} 件）`,
      };
    }
    return {
      message:
        "まだ承認待ちのようです。ネットワークの承認には数分かかることがあります。少し時間をおいて再度お試しください。",
    };
  } catch (error) {
    console.error("syncMyTips error", error);
    return { error: "ノードへの接続に失敗しました" };
  }
}

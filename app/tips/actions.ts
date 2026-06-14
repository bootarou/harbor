"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pollAddressTips } from "@/lib/tips/poller";

export type SyncTipsState = {
  message?: string;
  error?: string;
};

// 自分の XYM アドレス宛の着金をノードからポーリングし、投げ銭を確定する。
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
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { xymAddress: true },
  });
  if (!user?.xymAddress) {
    return { error: "先にウォレット（XYMアドレス）を設定してください" };
  }

  try {
    const r = await pollAddressTips(user.xymAddress);
    revalidatePath("/tips");
    return {
      message: `同期しました（新規確定 ${r.created + r.confirmed} 件 / 取得 ${r.scanned} 件）`,
    };
  } catch (error) {
    console.error("syncMyTips error", error);
    return { error: "ノードへの接続に失敗しました" };
  }
}

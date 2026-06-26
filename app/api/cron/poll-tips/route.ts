import { NextResponse } from "next/server";
import { pollAllTips } from "@/lib/tips/poller";
import { pollAllPurchases } from "@/lib/purchases/poller";
import { checkAndUpdateArchives } from "@/lib/archive-checker";

// 投げ銭の着金＋有料記事の購入をポーリングして確定/記録し、
// あわせて Harbor Archive（殿堂入り）の自動判定も行う（外部 cron 用）。
// CRON_SECRET による Bearer 認証で保護する。
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET が未設定です" },
      { status: 503 }
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  try {
    const [tips, purchases, archive] = await Promise.all([
      pollAllTips(),
      pollAllPurchases(),
      checkAndUpdateArchives(),
    ]);
    return NextResponse.json({ ok: true, tips, purchases, archive });
  } catch (error) {
    console.error("poll-tips error", error);
    return NextResponse.json({ error: "ポーリングに失敗しました" }, { status: 500 });
  }
}

export const POST = GET;

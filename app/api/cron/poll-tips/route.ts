import { NextResponse } from "next/server";
import { pollAllTips } from "@/lib/tips/poller";
import { pollAllPurchases } from "@/lib/purchases/poller";

// 投げ銭の着金＋有料記事の購入をポーリングして確定/記録する（外部 cron 用）。
// Harbor Archive（殿堂入り）は Thanks 記録時に discovery 到達で即時付与するため、ここでは扱わない。
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
    const [tips, purchases] = await Promise.all([
      pollAllTips(),
      pollAllPurchases(),
    ]);
    return NextResponse.json({ ok: true, tips, purchases });
  } catch (error) {
    console.error("poll-tips error", error);
    return NextResponse.json({ error: "ポーリングに失敗しました" }, { status: 500 });
  }
}

export const POST = GET;

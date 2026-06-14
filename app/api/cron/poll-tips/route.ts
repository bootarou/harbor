import { NextResponse } from "next/server";
import { pollAllTips } from "@/lib/tips/poller";

// 全著者アドレスの着金をポーリングして投げ銭を確定する（外部 cron 用）。
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
    const result = await pollAllTips();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("poll-tips error", error);
    return NextResponse.json({ error: "ポーリングに失敗しました" }, { status: 500 });
  }
}

export const POST = GET;

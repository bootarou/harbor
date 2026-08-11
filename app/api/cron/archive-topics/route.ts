import { NextResponse } from "next/server";
import { archiveStaleTopics } from "@/lib/community/archive";

// 最終投稿から30日投稿のないコミュニティトピックを自動アーカイブする（外部 cron 用）。
// CRON_SECRET による Bearer 認証で保護する（poll-tips と同じパターン）。
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET が未設定です" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const archived = await archiveStaleTopics();
    return NextResponse.json({ ok: true, archived });
  } catch (error) {
    console.error("archive-topics error", error);
    return NextResponse.json({ error: "アーカイブに失敗しました" }, { status: 500 });
  }
}

export const POST = GET;

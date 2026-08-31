import { NextResponse } from "next/server";
import { getLivekitConfig, listActiveVoiceRoomCounts } from "@/lib/livekit";

// トピック一覧（/community）のharborTalk状況。
// トピックID → 参加人数 を返す（人が居るルームのみ）。
// 閲覧は誰でも可（一覧ページ自体が公開のため）。返すのは人数だけで個人情報は含まない。
// LiveKit 未設定・応答不能なら空を返し、一覧の表示は妨げない。
export async function GET() {
  const cfg = getLivekitConfig();
  if (!cfg) return NextResponse.json({ counts: {} });
  const counts = await listActiveVoiceRoomCounts(cfg);
  return NextResponse.json({ counts });
}

export const dynamic = "force-dynamic";

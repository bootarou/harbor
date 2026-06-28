import { NextResponse } from "next/server";
import { getUndiscoveredPosts } from "@/lib/undiscovered";

// 「もっと見る」用。まだ投げ銭の無い記事をランダムで返す。
// 毎回違う結果を返すためキャッシュしない。自分の記事も含めて返し、
// 応援ボタンの表示可否はクライアント側（currentUserId 比較）で制御する。
// exclude（カンマ区切りの記事id）で表示済みを除外し、追加分のみ返す。
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = Number.parseInt(searchParams.get("limit") ?? "5", 10);
  const limit = Math.min(20, Math.max(1, Number.isFinite(raw) ? raw : 5));
  const excludeIds = (searchParams.get("exclude") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200); // URL 肥大・過大入力の防御

  const result = await getUndiscoveredPosts({ limit, excludeIds });

  return NextResponse.json(result);
}

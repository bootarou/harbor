import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { voiceSpeakerSchema } from "@/lib/validations";
import { MAX_SPEAKERS, getLivekitConfig, setSpeaker } from "@/lib/livekit";

// 発言権（スピーカー）の取得／返却。
// - 認証必須。対象は「自分自身」のみ（他人の権限は変更できない）。
// - 取得はスピーカーが MAX_SPEAKERS 未満のときだけ。満員なら 403。
// - 実際の権限更新は LiveKit の RoomServiceClient で行う（ルーム単位で直列化）。
export async function POST(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const { topicId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const userId = session.user.id;

  const cfg = getLivekitConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "harborトークは利用できません" },
      { status: 503 }
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = voiceSpeakerSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "入力が不正です" },
      { status: 400 }
    );
  }

  try {
    const result = await setSpeaker(cfg, topicId, userId, parsed.data.speak);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      ok: true,
      speaking: parsed.data.speak,
      speakers: result.speakers,
      maxSpeakers: MAX_SPEAKERS,
    });
  } catch (error) {
    console.error("voice-speaker error", error);
    return NextResponse.json(
      { error: "発言権の変更に失敗しました" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

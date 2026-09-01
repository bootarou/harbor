import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { voiceScreenShareSchema } from "@/lib/validations";
import { getLivekitConfig, setScreenShare } from "@/lib/livekit";

// 画面共有の開始／停止。
// - 認証必須。対象は「自分自身」のみ（他人の共有は操作できない）。
// - 開始は発言権を持つ人だけ。かつルーム内で誰も共有していないときのみ。
// - 許可した相手にだけ SCREEN_SHARE の publish 権限を与えるため、
//   ロックを持たない参加者はそもそも publish できない（クライアント任せにしない）。
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
  const parsed = voiceScreenShareSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "入力が不正です" },
      { status: 400 }
    );
  }

  try {
    const result = await setScreenShare(cfg, topicId, userId, parsed.data.share);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, identity: result.identity });
  } catch (error) {
    console.error("voice-screenshare error", error);
    return NextResponse.json(
      { error: "画面共有を開始できませんでした" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

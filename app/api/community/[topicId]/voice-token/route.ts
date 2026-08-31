import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import {
  MAX_SPEAKERS,
  createVoiceToken,
  getLivekitConfig,
  listVoiceParticipants,
} from "@/lib/livekit";

// 音声スペースへの参加トークンを発行する。
// - 認証必須（DID セッション）。identity は User.id。
// - 既定は聴講者（canPublish: false）。発言は voice-speaker で申請する。
// - metadata には公開情報のみ（userId / 表示名 / アイコン / 受取アドレス）を載せる。
export async function GET(
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
      { error: "harborTalkは利用できません" },
      { status: 503 }
    );
  }

  // 再接続の連打を抑える程度の緩い制限。
  const rl = rateLimit(`voice-token:${userId}`, 30, 10 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const [topic, me] = await Promise.all([
    prisma.communityTopic.findUnique({
      where: { id: topicId },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, avatarUrl: true, xymAddress: true },
    }),
  ]);
  if (!topic) {
    return NextResponse.json({ error: "トピックが見つかりません" }, { status: 404 });
  }

  const token = await createVoiceToken(cfg, topicId, {
    userId,
    displayName: me?.displayName ?? null,
    avatarUrl: me?.avatarUrl ?? null,
    xymAddress: me?.xymAddress ?? null,
  });

  // 参加前に満員かどうかを表示できるよう、現在のスピーカー数も返す。
  const participants = await listVoiceParticipants(cfg, topicId);
  const speakers = participants.filter((p) => p.permission?.canPublish).length;

  return NextResponse.json({
    token,
    wsUrl: cfg.wsUrl,
    maxSpeakers: MAX_SPEAKERS,
    speakers,
  });
}

export const dynamic = "force-dynamic";

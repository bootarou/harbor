import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ImageValidationError, saveImage } from "@/lib/storage";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";

// コミュニティチャットの画像アップロード（要ログイン）。
// 保存時に長辺500pxへ縮小・圧縮してサーバー/ストレージ負荷を抑える。
const CHAT_IMAGE_MAX_DIMENSION = 500;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  // 画像処理・保存を伴うため制限（連投・帯域の浪費対策）。
  const rl = rateLimit(`community-upload:${session.user.id}`, 30, 10 * 60 * 1000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "ファイルが指定されていません" },
      { status: 400 }
    );
  }

  try {
    const url = await saveImage(file, "community", CHAT_IMAGE_MAX_DIMENSION);
    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    if (error instanceof ImageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("community image upload error", error);
    return NextResponse.json({ error: "アップロードに失敗しました" }, { status: 500 });
  }
}

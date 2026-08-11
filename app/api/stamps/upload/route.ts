import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ImageValidationError, saveStampImage } from "@/lib/storage";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";

// スタンプ画像専用アップロード（要ログイン）。
// PNG/GIF/WebP・1MB以下・正方形(1:1)のみ。PNGは500x500へリサイズ、GIF/WebPはそのまま保存。
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const rl = rateLimit(`stamp-upload:${session.user.id}`, 30, 10 * 60 * 1000);
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
    const url = await saveStampImage(file);
    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    if (error instanceof ImageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("stamp upload error", error);
    return NextResponse.json(
      { error: "アップロードに失敗しました" },
      { status: 500 }
    );
  }
}

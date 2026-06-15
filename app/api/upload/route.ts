import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ImageValidationError, saveImage } from "@/lib/storage";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";

// 画像アップロード（要ログイン）。アバター・記事画像で再利用する。
// multipart/form-data の "file" を受け取り、保存先 URL を返す。
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  // 画像処理・保存を伴うため制限（ストレージ/帯域の浪費対策）。
  const rl = rateLimit(`upload:${session.user.id}`, 60, 10 * 60 * 1000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "ファイルが指定されていません" },
      { status: 400 }
    );
  }

  const prefixRaw = formData?.get("prefix");
  const prefix = typeof prefixRaw === "string" ? prefixRaw : "misc";

  try {
    const url = await saveImage(file, prefix);
    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    if (error instanceof ImageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("upload error", error);
    return NextResponse.json(
      { error: "アップロードに失敗しました" },
      { status: 500 }
    );
  }
}

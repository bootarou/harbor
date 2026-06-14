import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchOgp, OgpError } from "@/lib/ogp";

// 外部URLの OGP プレビュー取得（要ログイン・URL投稿のプレビュー用）。
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  const url = body?.url?.trim() ?? "";
  if (!url) {
    return NextResponse.json({ error: "URLを入力してください" }, { status: 400 });
  }
  try {
    const ogp = await fetchOgp(url);
    return NextResponse.json({ ok: true, ogp });
  } catch (e) {
    if (e instanceof OgpError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("ogp error", e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

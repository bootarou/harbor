import { NextResponse } from "next/server";
import { getPostsPage } from "@/lib/posts";

// 一覧の追加ページ取得（無限スクロール用・公開記事のみ）。
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);
  const q = sp.get("q") ?? "";
  const tag = sp.get("tag") ?? "";

  const { posts, hasMore } = await getPostsPage({ page, q, tag });
  return NextResponse.json({ posts, hasMore });
}

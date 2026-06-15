import { NextResponse } from "next/server";

// HTML ドキュメント（ページ）は常に再検証させ、古いキャッシュで古い JS バンドルを
// 読み込んでしまう問題（例: 旧ヘッダーが残りハンバーガーが出ない）を防ぐ。
// ハッシュ付きの静的アセット(/_next/static)・画像・API は対象外（matcher で除外）。
export function proxy() {
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "no-cache, must-revalidate");
  return res;
}

export const config = {
  // api / _next/static / _next/image / favicon / 拡張子付きファイル（画像等）を除外。
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};

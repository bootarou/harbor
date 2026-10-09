/**
 * 画像URLが「自サイトで保存したもの」かどうか。
 *
 * 外部URLを画像として受け付けると、表示した人のブラウザが外部サーバーへ
 * 取りに行くため、閲覧者の IP や閲覧時刻を集められてしまう（トラッキング）。
 * さらに後から中身を差し替えられるので、通報や審査を経た画像を
 * 別物にすり替えられる（販売済みスタンプなど）。
 *
 * 文字列の前方一致では判定しない。"https://cdn.example.com.evil.com/x" や
 * "https://cdn.example.com@evil.com/x" も前方一致では通ってしまうため、
 * URL として解析し、オリジンとパスで比べる。
 *
 * サーバー専用の依存を持たせない（バリデーションから使うため）。
 */
export function isOwnImageUrl(u: string): boolean {
  // ローカル保存（S3 未設定時）の公開パス。
  // "//host/..." はプロトコル相対で別オリジンなので、"/uploads/" で始まるものだけ。
  if (u.startsWith("/uploads/")) return true;

  const base = process.env.NEXT_PUBLIC_S3_PUBLIC_URL;
  if (!base) return false;

  let target: URL;
  let root: URL;
  try {
    target = new URL(u);
    root = new URL(base);
  } catch {
    return false;
  }
  if (target.origin !== root.origin) return false;
  if (target.username || target.password) return false;
  // 公開URLにパスが含まれる場合（例: https://cdn.example.com/bucket）はその配下に限る。
  const rootPath = root.pathname.endsWith("/") ? root.pathname : `${root.pathname}/`;
  return target.pathname.startsWith(rootPath);
}

import { readFile } from "node:fs/promises";
import path from "node:path";

// ローカル保存（S3未設定時）の画像を配信する。
// next start（本番）は起動後に public/ へ書かれたファイルを配信しないため、
// /uploads/... はこのルートハンドラがディスクから読んで返す。

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

const CONTENT_TYPE: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await context.params;

  // パストラバーサル対策: 各セグメントは安全な文字のみ許可。
  if (
    !Array.isArray(segments) ||
    segments.length === 0 ||
    segments.some((s) => !/^[A-Za-z0-9._-]+$/.test(s) || s === ".." )
  ) {
    return new Response("Not found", { status: 404 });
  }

  const ext = path.extname(segments[segments.length - 1]).toLowerCase();
  const contentType = CONTENT_TYPE[ext];
  if (!contentType) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path.join(UPLOADS_ROOT, ...segments);
  // 解決後パスが uploads ルート配下であることを再確認。
  if (!filePath.startsWith(UPLOADS_ROOT + path.sep)) {
    return new Response("Not found", { status: 404 });
  }

  let data: Buffer;
  try {
    data = await readFile(filePath);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      // ファイル名は UUID なので長期キャッシュ可。
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

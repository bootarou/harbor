import "server-only";
import { fetchRemoteImageSafe } from "@/lib/ogp";
import { saveImage } from "@/lib/storage";

const EXT_BY_IMAGE_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

// 自前ストレージ上の URL か（再ホスト不要の判定）。
// - 相対 /uploads/ はローカルフォールバック保存先
// - S3 公開URLの接頭辞に一致するものも自前
export function isOwnImageUrl(u: string): boolean {
  if (u.startsWith("/uploads/")) return true;
  const base = (process.env.NEXT_PUBLIC_S3_PUBLIC_URL || "").replace(/\/$/, "");
  return base !== "" && u.startsWith(base);
}

// 外部の og:image を自前ストレージへ再ホストし、保存後の公開URLを返す。
// 取得・保存いずれかに失敗したら null（呼び出し側は元の外部URLにフォールバック）。
export async function rehostOgImage(url: string): Promise<string | null> {
  const img = await fetchRemoteImageSafe(url).catch(() => null);
  if (!img) return null;
  const ext = EXT_BY_IMAGE_MIME[img.contentType];
  if (!ext) return null; // 対応形式以外は再ホストせず外部URLのまま
  try {
    const file = new File([new Uint8Array(img.buffer)], `og.${ext}`, {
      type: img.contentType,
    });
    return await saveImage(file, "ogp");
  } catch {
    return null;
  }
}

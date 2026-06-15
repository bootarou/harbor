import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

// 画像ストレージ抽象。
// - S3 互換ストレージの環境変数が揃っていればそちらへアップロード（本番想定 / R2 等）。
// - 揃っていなければ開発用に public/uploads/ へ保存する。
// 保存前に sharp でリサイズ＋再エンコード（圧縮）してから書き出す。
// 返り値は公開 URL（または /uploads/... の相対パス）。

type ImageFormat = "png" | "jpg" | "webp" | "gif";

const ALLOWED_MIME = new Map<string, ImageFormat>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

const MIME_BY_FORMAT: Record<ImageFormat, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

// アップロード時点で受け付ける入力ファイルの上限（DoS 対策のハードキャップ）。
// これを超えるファイルはリサイズせず拒否する。
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB
// 後方互換のためのエイリアス。
export const MAX_IMAGE_BYTES = MAX_UPLOAD_BYTES;

// リサイズ後の長辺の最大ピクセル数（縦横どちらもこの値以内に収める）。
const MAX_DIMENSION = 2000;

export class ImageValidationError extends Error {}

/**
 * 画像をリサイズ（長辺 MAX_DIMENSION 以内・拡大はしない）し、形式ごとに再エンコードして圧縮する。
 * アニメーション GIF はフレームを保持したままリサイズする。
 */
async function processImage(
  input: Buffer,
  format: ImageFormat
): Promise<{ buffer: Buffer; contentType: string }> {
  // GIF はアニメーションを保持するため全フレームを読み込む。
  const pipeline = sharp(input, { animated: format === "gif" }).resize({
    width: MAX_DIMENSION,
    height: MAX_DIMENSION,
    fit: "inside",
    withoutEnlargement: true,
  });

  let buffer: Buffer;
  switch (format) {
    case "jpg":
      buffer = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      break;
    case "png":
      buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
      break;
    case "webp":
      buffer = await pipeline.webp({ quality: 82 }).toBuffer();
      break;
    case "gif":
      buffer = await pipeline.gif().toBuffer();
      break;
  }
  return { buffer, contentType: MIME_BY_FORMAT[format] };
}

function isS3Configured(): boolean {
  return Boolean(
    process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY
  );
}

let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
      },
    });
  }
  return s3Client;
}

/**
 * 画像ファイルを保存し、公開 URL を返す。
 * @param file ブラウザから受け取った File（multipart/form-data）
 * @param prefix キーの接頭辞（例: "avatars", "posts"）
 */
export async function saveImage(file: File, prefix: string): Promise<string> {
  const format = ALLOWED_MIME.get(file.type);
  if (!format) {
    throw new ImageValidationError(
      "対応していない画像形式です（png/jpeg/webp/gif のみ）"
    );
  }
  if (file.size === 0) {
    throw new ImageValidationError("空のファイルです");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImageValidationError("画像サイズは25MB以下にしてください");
  }

  const input = Buffer.from(await file.arrayBuffer());

  // 大きい画像は長辺 2000px 以内へリサイズし、形式ごとに再エンコードして圧縮する。
  let bytes: Buffer;
  let contentType: string;
  try {
    const processed = await processImage(input, format);
    bytes = processed.buffer;
    contentType = processed.contentType;
  } catch {
    throw new ImageValidationError(
      "画像を処理できませんでした（破損または非対応の画像の可能性があります）"
    );
  }

  const safePrefix = prefix.replace(/[^a-z0-9_-]/gi, "");
  const key = `${safePrefix}/${randomUUID()}.${format}`;

  if (isS3Configured()) {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      })
    );
    const base = (process.env.NEXT_PUBLIC_S3_PUBLIC_URL || "").replace(
      /\/$/,
      ""
    );
    return `${base}/${key}`;
  }

  // ローカルフォールバック（開発用）。public/uploads/ 配下に保存。
  const uploadsDir = path.join(process.cwd(), "public", "uploads", safePrefix);
  await mkdir(uploadsDir, { recursive: true });
  const fileName = key.split("/").pop() as string;
  await writeFile(path.join(uploadsDir, fileName), bytes);
  return `/uploads/${key}`;
}

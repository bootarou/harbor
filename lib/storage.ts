import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// 画像ストレージ抽象。
// - S3 互換ストレージの環境変数が揃っていればそちらへアップロード（本番想定 / R2 等）。
// - 揃っていなければ開発用に public/uploads/ へ保存する。
// 返り値は公開 URL（または /uploads/... の相対パス）。

const ALLOWED_MIME = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

export class ImageValidationError extends Error {}

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
  const ext = ALLOWED_MIME.get(file.type);
  if (!ext) {
    throw new ImageValidationError(
      "対応していない画像形式です（png/jpeg/webp/gif のみ）"
    );
  }
  if (file.size === 0) {
    throw new ImageValidationError("空のファイルです");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageValidationError("画像サイズは5MB以下にしてください");
  }

  const safePrefix = prefix.replace(/[^a-z0-9_-]/gi, "");
  const key = `${safePrefix}/${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  if (isS3Configured()) {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: file.type,
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

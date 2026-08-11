"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveStamp, type StampFormState } from "@/app/stamps/actions";

type StampInitial = {
  id?: string;
  name: string;
  description: string;
  imageUrl: string;
  price: string;
  published: boolean;
};

const initialState: StampFormState = {};

export function StampForm({ initial }: { initial: StampInitial }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveStamp, initialState);

  const [imageUrl, setImageUrl] = useState(initial.imageUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.success) {
      router.push("/stamps/manage");
    }
  }, [state.success, router]);

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    // 保存時にサーバー側で長辺500pxへ縮小・圧縮するが、入力は5MBまで。
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("画像は5MB以下を選択してください");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/stamps/upload", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;
      if (!res.ok || !data?.url) {
        setUploadError(data?.error ?? "アップロードに失敗しました");
        return;
      }
      setImageUrl(data.url);
    } catch {
      setUploadError("アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      {initial.id && <input type="hidden" name="stampId" value={initial.id} />}
      <input type="hidden" name="imageUrl" value={imageUrl} />

      <label className="flex flex-col gap-1 text-sm">
        スタンプ名
        <input
          type="text"
          name="name"
          required
          maxLength={80}
          defaultValue={initial.name}
          placeholder="スタンプの名前"
          className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        説明（任意）
        <textarea
          name="description"
          rows={2}
          maxLength={500}
          defaultValue={initial.description}
          placeholder="スタンプの説明"
          className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>

      <div className="flex flex-col gap-2 text-sm">
        <span>
          スタンプ画像（PNG / GIF / WebP・5MB以下）
          <span className="ml-1 text-xs text-gray-400">
            ※保存時に長辺500pxへ自動縮小・圧縮します
          </span>
        </span>
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="スタンプ"
            className="h-32 w-32 rounded-md border border-gray-200 bg-gray-50 object-contain dark:border-gray-700 dark:bg-gray-800"
          />
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="self-start rounded-md border border-gray-300 px-3 py-1.5 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          {uploading ? "アップロード中..." : imageUrl ? "画像を変更" : "画像を選択"}
        </button>
        {uploadError && (
          <p className="text-red-600 dark:text-red-400">{uploadError}</p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/gif,image/webp"
          onChange={onPickImage}
          className="hidden"
        />
      </div>

      <label className="flex flex-col gap-1 text-sm">
        価格（XYM）
        <input
          type="number"
          name="price"
          required
          step="0.000001"
          min="0.000001"
          defaultValue={initial.price}
          placeholder="例: 5"
          className="w-40 rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="published"
          value="true"
          defaultChecked={initial.published}
          className="h-4 w-4"
        />
        公開する（チェックを外すと非公開）
      </label>

      <div className="rounded-md bg-yellow-50 p-3 text-xs text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
        <label className="flex items-start gap-2">
          <input type="checkbox" name="copyright" value="true" className="mt-0.5" />
          このスタンプ画像は自分が権利を持つ（または利用許諾を得た）ものであり、第三者の著作権を侵害しないことを確認します。
        </label>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending || uploading}
          className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
        >
          {pending ? "保存中..." : "保存する"}
        </button>
        <Link href="/stamps/manage" className="text-sm underline">
          キャンセル
        </Link>
      </div>
    </form>
  );
}

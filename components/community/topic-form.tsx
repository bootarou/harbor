"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveTopic, type TopicFormState } from "@/app/community/actions";

type TopicInitial = {
  id?: string;
  name: string;
  description: string;
  iconUrl: string;
};

const initialState: TopicFormState = {};

export function TopicForm({ initial }: { initial: TopicInitial }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveTopic, initialState);
  const [iconUrl, setIconUrl] = useState(initial.iconUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.success) router.push(`/community/${state.success.id}`);
  }, [state.success, router]);

  async function onPickIcon(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("prefix", "community");
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;
      if (!res.ok || !data?.url) {
        setUploadError(data?.error ?? "アップロードに失敗しました");
        return;
      }
      setIconUrl(data.url);
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
      {initial.id && <input type="hidden" name="topicId" value={initial.id} />}
      <input type="hidden" name="iconUrl" value={iconUrl} />

      <label className="flex flex-col gap-1 text-sm">
        トピック名
        <input
          type="text"
          name="name"
          required
          maxLength={80}
          defaultValue={initial.name}
          placeholder="例: Symbol 雑談"
          className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        説明（任意）
        <textarea
          name="description"
          rows={3}
          maxLength={500}
          defaultValue={initial.description}
          placeholder="このトピックについて"
          className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>

      <div className="flex flex-col gap-2 text-sm">
        <span>アイコン画像（任意・正方形推奨）</span>
        {iconUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={iconUrl}
            alt="アイコン"
            className="h-20 w-20 rounded-lg border border-gray-200 bg-gray-50 object-cover dark:border-gray-700 dark:bg-gray-800"
          />
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="self-start rounded-md border border-gray-300 px-3 py-1.5 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          {uploading ? "アップロード中..." : iconUrl ? "画像を変更" : "画像を選択"}
        </button>
        {uploadError && <p className="text-red-600 dark:text-red-400">{uploadError}</p>}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={onPickIcon}
          className="hidden"
        />
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending || uploading}
          className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
        >
          {pending ? "保存中..." : "保存する"}
        </button>
        <Link href="/community" className="text-sm underline">
          キャンセル
        </Link>
      </div>
    </form>
  );
}

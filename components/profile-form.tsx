"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfile, type ProfileFormState } from "@/app/profile/actions";

type ProfileInitial = {
  displayName: string;
  bio: string;
  xAccount: string;
  avatarUrl: string;
  coverImage: string;
  email: string;
  emailNotificationsEnabled: boolean;
  websiteUrl: string;
  tokushoho: string;
  salesTerms: string;
};

const initialState: ProfileFormState = {};

export function ProfileForm({ initial }: { initial: ProfileInitial }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateProfile,
    initialState
  );

  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [coverImage, setCoverImage] = useState(initial.coverImage);
  const [uploading, setUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploading(true);

    const body = new FormData();
    body.append("file", file);
    body.append("prefix", "avatars");

    const res = await fetch("/api/upload", { method: "POST", body });
    setUploading(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      setUploadError(data?.error ?? "アップロードに失敗しました");
      return;
    }

    const data = (await res.json()) as { url: string };
    setAvatarUrl(data.url);
  }

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploadError(null);
    setCoverUploading(true);

    const body = new FormData();
    body.append("file", file);
    body.append("prefix", "profile-covers");

    const res = await fetch("/api/upload", { method: "POST", body });
    setCoverUploading(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      setUploadError(data?.error ?? "アップロードに失敗しました");
      return;
    }

    const data = (await res.json()) as { url: string };
    setCoverImage(data.url);
  }

  // 更新成功後はサーバーコンポーネントを再取得して最新状態を反映。
  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          プロフィールを更新しました
        </p>
      )}

      <div className="flex flex-col gap-2 text-sm">
        <span>カバー画像（公開プロフィールのバナー・シェア時のOGP画像に使用）</span>
        <div className="aspect-[3/1] w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
          {coverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverImage}
              alt="カバー画像"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="select-none text-xs text-gray-400 dark:text-gray-500">
                カバー画像なし
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => coverRef.current?.click()}
            disabled={coverUploading}
            className="rounded-md border border-gray-300 px-3 py-1.5 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            {coverUploading ? "アップロード中..." : "カバー画像を選択"}
          </button>
          {coverImage && (
            <button
              type="button"
              onClick={() => setCoverImage("")}
              className="text-xs text-gray-500 underline dark:text-gray-400"
            >
              画像を削除
            </button>
          )}
        </div>
        <input
          ref={coverRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleCoverChange}
          className="hidden"
        />
      </div>
      <input type="hidden" name="coverImage" value={coverImage} />

      <div className="flex items-center gap-4">
        {/* アバターは外部/相対の様々なドメインになり得るため next/image ではなく img を使用 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl || "/avatar-placeholder.svg"}
          alt="アバター"
          className="h-20 w-20 rounded-full border border-gray-200 object-cover dark:border-gray-700"
        />
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            {uploading ? "アップロード中..." : "画像を選択"}
          </button>
          {avatarUrl && (
            <button
              type="button"
              onClick={() => setAvatarUrl("")}
              className="text-left text-xs text-gray-500 underline dark:text-gray-400"
            >
              画像を削除
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>
      {uploadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{uploadError}</p>
      )}
      <input type="hidden" name="avatarUrl" value={avatarUrl} />

      <label className="flex flex-col gap-1 text-sm">
        表示名
        <input
          type="text"
          name="displayName"
          required
          maxLength={50}
          defaultValue={initial.displayName}
          className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        自己紹介
        <textarea
          name="bio"
          rows={4}
          maxLength={500}
          defaultValue={initial.bio}
          className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        X（旧Twitter）アカウント名
        <div className="flex items-center gap-2">
          <span className="text-gray-500">@</span>
          <input
            type="text"
            name="xAccount"
            placeholder="username"
            maxLength={16}
            defaultValue={initial.xAccount}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        WebサイトURL（https://）
        <input
          type="url"
          name="websiteUrl"
          placeholder="https://example.com"
          maxLength={2048}
          defaultValue={initial.websiteUrl}
          className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        メールアドレス（任意・ログインには使いません）
        <input
          type="email"
          name="email"
          placeholder="user@example.com"
          defaultValue={initial.email}
          className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="emailNotificationsEnabled"
          value="true"
          defaultChecked={initial.emailNotificationsEnabled}
          className="h-4 w-4"
        />
        メール通知を受け取る（メール登録時のみ有効）
      </label>

      <div className="mt-2 border-t border-gray-200 pt-4 dark:border-gray-800">
        <p className="text-sm font-semibold">販売者向け情報（任意）</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          有料記事を販売する場合に記載してください。入力時のみプロフィールに表示されます（HTMLは使用できません）。
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        📜 特定商取引法に基づく表記
        <textarea
          name="tokushoho"
          rows={5}
          maxLength={5000}
          defaultValue={initial.tokushoho}
          placeholder="販売事業者名・連絡先・販売価格・支払方法・引渡時期・返品/キャンセル条件 など"
          className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        利用規約・販売条件
        <textarea
          name="salesTerms"
          rows={5}
          maxLength={5000}
          defaultValue={initial.salesTerms}
          placeholder="購読権の内容・利用範囲・禁止事項 など"
          className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>

      <button
        type="submit"
        disabled={pending || uploading || coverUploading}
        className="mt-2 rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
      >
        {pending ? "保存中..." : "保存する"}
      </button>
    </form>
  );
}

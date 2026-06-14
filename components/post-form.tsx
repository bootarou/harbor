"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { savePost, type PostFormState } from "@/app/posts/actions";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { TagInput } from "@/components/tag-input";

type PostInitial = {
  id?: string;
  title: string;
  contentHTML: string;
  coverImage: string;
  published: boolean;
  tags: string[];
  paid: boolean;
  paidHtml: string;
  priceAmount: string;
  priceCurrency: string;
  sellerAddress: string;
  publishAt: string; // datetime-local 形式 or ""
  defaultSellerAddress: string; // ウォレット登録済みアドレス（プレフィル用）
};

const initialState: PostFormState = {};

export function PostForm({ initial }: { initial: PostInitial }) {
  const [state, formAction, pending] = useActionState(savePost, initialState);

  const [contentHTML, setContentHTML] = useState(initial.contentHTML);
  const [paidHtml, setPaidHtml] = useState(initial.paidHtml);
  const [paid, setPaid] = useState(initial.paid);
  const [coverImage, setCoverImage] = useState(initial.coverImage);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const [dirty, setDirty] = useState(false);
  const markDirty = () => setDirty(true);
  const guardActive = dirty && !pending;

  useEffect(() => {
    if (!guardActive) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [guardActive]);

  useEffect(() => {
    if (!guardActive) return;
    window.history.pushState(null, "", window.location.href);
    const onPopState = () => {
      const leave = window.confirm(
        "編集中の内容は保存されていません。このページを離れますか？"
      );
      if (leave) {
        window.removeEventListener("popstate", onPopState);
        window.history.back();
      } else {
        window.history.pushState(null, "", window.location.href);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [guardActive]);

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCoverError(null);
    setCoverUploading(true);
    const body = new FormData();
    body.append("file", file);
    body.append("prefix", "covers");
    const res = await fetch("/api/upload", { method: "POST", body });
    setCoverUploading(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      setCoverError(data?.error ?? "アップロードに失敗しました");
      return;
    }
    const { url } = (await res.json()) as { url: string };
    setCoverImage(url);
    setDirty(true);
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      {initial.id && <input type="hidden" name="postId" value={initial.id} />}
      <input type="hidden" name="contentHTML" value={contentHTML} />
      <input type="hidden" name="paidHtml" value={paidHtml} />
      <input type="hidden" name="paid" value={paid ? "true" : "false"} />

      <label className="flex flex-col gap-1 text-sm">
        タイトル
        <input
          type="text"
          name="title"
          required
          maxLength={200}
          defaultValue={initial.title}
          onChange={markDirty}
          placeholder="記事のタイトル"
          className="rounded-md border border-gray-300 px-3 py-2 text-lg dark:border-gray-700 dark:bg-gray-900"
        />
      </label>

      <TagInput name="tags" initialTags={initial.tags} onChange={markDirty} />

      {/* カバー画像 */}
      <div className="flex flex-col gap-2 text-sm">
        <span>カバー画像</span>
        {coverImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImage}
            alt="カバー画像"
            className="max-h-48 w-full rounded-md border border-gray-200 object-cover dark:border-gray-700"
          />
        )}
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
              onClick={() => {
                setCoverImage("");
                setDirty(true);
              }}
              className="text-xs text-gray-500 underline dark:text-gray-400"
            >
              削除
            </button>
          )}
        </div>
        {coverError && (
          <p className="text-red-600 dark:text-red-400">{coverError}</p>
        )}
        <input
          ref={coverRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleCoverChange}
          className="hidden"
        />
      </div>

      {/* 公開方式 */}
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 font-semibold">公開方式</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="publishMode"
            checked={!paid}
            onChange={() => {
              setPaid(false);
              markDirty();
            }}
          />
          通常公開（全文を無料公開）
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="publishMode"
            checked={paid}
            onChange={() => {
              setPaid(true);
              markDirty();
            }}
          />
          販売公開（試し読み＋有料の全文）
        </label>
      </fieldset>

      {/* 本文（無料部分） */}
      <div className="flex flex-col gap-1 text-sm">
        <span>{paid ? "試し読み（無料で公開する部分）" : "本文"}</span>
        <TiptapEditor
          initialHTML={initial.contentHTML}
          onChange={(html) => {
            setContentHTML(html);
            setDirty(true);
          }}
        />
      </div>

      {/* 販売公開の設定 */}
      {paid && (
        <div className="flex flex-col gap-4 rounded-lg border border-amber-300 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-sm font-semibold">販売設定</p>

          <div className="flex flex-col gap-1 text-sm">
            <span>有料部分（購入者のみ閲覧）</span>
            <TiptapEditor
              initialHTML={initial.paidHtml}
              onChange={(html) => {
                setPaidHtml(html);
                setDirty(true);
              }}
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-sm">
              販売価格
              <input
                type="number"
                name="priceAmount"
                step="0.000001"
                min="0.000001"
                defaultValue={initial.priceAmount}
                onChange={markDirty}
                className="w-32 rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              通貨・モザイク
              <select
                name="priceCurrency"
                defaultValue={initial.priceCurrency || "XYM"}
                onChange={markDirty}
                className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="XYM">XYM</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            販売者アドレス（受取先）
            <input
              type="text"
              name="sellerAddress"
              defaultValue={initial.sellerAddress || initial.defaultSellerAddress}
              onChange={markDirty}
              placeholder="T..."
              className="rounded-md border border-gray-300 px-3 py-2 font-mono text-xs dark:border-gray-700 dark:bg-gray-900"
            />
          </label>

          <div className="rounded-md bg-yellow-100 px-3 py-2 text-xs text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
            有料記事・購読権の販売を事業として行う場合は、プロフィール欄に「特定商取引法に基づく表記」および「利用規約・販売条件」を記載し、販売者自身の責任で必要な法令対応を行ってください。
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="consent" value="true" className="mt-1" />
            <span>
              有料記事・購読権の販売に関する必要な法令対応は、販売者である投稿者自身の責任で行います。
            </span>
          </label>
        </div>
      )}

      {/* 公開日時 */}
      <label className="flex flex-col gap-1 text-sm">
        公開日時（空欄なら即時公開。未来を指定するとその時刻まで非公開）
        <input
          type="datetime-local"
          name="publishAt"
          defaultValue={initial.publishAt}
          onChange={markDirty}
          className="w-64 rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="published"
          value="true"
          defaultChecked={initial.published}
          onChange={markDirty}
          className="h-4 w-4"
        />
        公開する（チェックを外すと下書き）
      </label>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending || coverUploading}
          className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
        >
          {pending ? "保存中..." : "保存する"}
        </button>
        <Link href="/dashboard" className="text-sm underline">
          キャンセル
        </Link>
      </div>
    </form>
  );
}

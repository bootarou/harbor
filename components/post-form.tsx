"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { savePost, type PostFormState } from "@/app/posts/actions";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { TagInput } from "@/components/tag-input";

type Ogp = {
  title: string;
  description: string;
  imageUrl: string;
  siteName: string;
  url: string;
};

type PostInitial = {
  id?: string;
  postType: "article" | "external_url";
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
  publishAt: string;
  defaultSellerAddress: string;
  url: string;
  comment: string;
  tipsEnabled: boolean;
  ogp: Ogp | null;
};

const initialState: PostFormState = {};

export function PostForm({ initial }: { initial: PostInitial }) {
  const [state, formAction, pending] = useActionState(savePost, initialState);

  const [postType, setPostType] = useState(initial.postType);
  const isUrl = postType === "external_url";

  const [contentHTML, setContentHTML] = useState(initial.contentHTML);
  const [paidHtml, setPaidHtml] = useState(initial.paidHtml);
  const [paid, setPaid] = useState(initial.paid);
  const [coverImage, setCoverImage] = useState(initial.coverImage);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  // URL投稿
  const [url, setUrl] = useState(initial.url);
  const [ogp, setOgp] = useState<Ogp | null>(initial.ogp);
  const [ogpLoading, setOgpLoading] = useState(false);
  const [ogpError, setOgpError] = useState<string | null>(null);

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
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setCoverError(data?.error ?? "アップロードに失敗しました");
      return;
    }
    const { url: u } = (await res.json()) as { url: string };
    setCoverImage(u);
    setDirty(true);
  }

  async function fetchOgp() {
    setOgpError(null);
    if (!/^https?:\/\/\S+$/i.test(url.trim())) {
      setOgpError("有効なURL（http/https）を入力してください。");
      return;
    }
    setOgpLoading(true);
    const res = await fetch("/api/ogp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim() }),
    });
    setOgpLoading(false);
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; ogp?: Ogp; error?: string }
      | null;
    if (!res.ok || !data?.ogp) {
      setOgpError(data?.error ?? "OGPの取得に失敗しました");
      return;
    }
    setOgp(data.ogp);
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
      <input type="hidden" name="postType" value={postType} />

      {/* 投稿タイプ */}
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 font-semibold">投稿タイプ</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="postTypeRadio"
            checked={!isUrl}
            onChange={() => {
              setPostType("article");
              markDirty();
            }}
          />
          記事を書く
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="postTypeRadio"
            checked={isUrl}
            onChange={() => {
              setPostType("external_url");
              markDirty();
            }}
          />
          外部コンテンツのURLを共有する
        </label>
      </fieldset>

      {!isUrl && (
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
      )}

      <TagInput name="tags" initialTags={initial.tags} onChange={markDirty} />

      {/* ===== URL投稿 ===== */}
      {isUrl && (
        <div className="flex flex-col gap-4">
          <input type="hidden" name="ogpTitle" value={ogp?.title ?? ""} />
          <input type="hidden" name="ogpDescription" value={ogp?.description ?? ""} />
          <input type="hidden" name="ogpImageUrl" value={ogp?.imageUrl ?? ""} />
          <input type="hidden" name="ogpSiteName" value={ogp?.siteName ?? ""} />

          <label className="flex flex-col gap-1 text-sm">
            外部URL
            <div className="flex gap-2">
              <input
                type="url"
                name="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  markDirty();
                }}
                placeholder="https://example.com/article"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
              />
              <button
                type="button"
                onClick={fetchOgp}
                disabled={ogpLoading}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-700"
              >
                {ogpLoading ? "取得中..." : "プレビュー取得"}
              </button>
            </div>
          </label>
          {ogpError && (
            <p className="text-sm text-red-600 dark:text-red-400">{ogpError}</p>
          )}

          {ogp && (
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
              {ogp.imageUrl && (
                <div className="aspect-video w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ogp.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <div className="p-3">
                <p className="text-sm font-semibold">{ogp.title || "(タイトルなし)"}</p>
                {ogp.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-gray-600 dark:text-gray-400">
                    {ogp.description}
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-400">{ogp.siteName}</p>
              </div>
            </div>
          )}

          <label className="flex flex-col gap-1 text-sm">
            投稿コメント
            <textarea
              name="comment"
              rows={4}
              maxLength={2000}
              defaultValue={initial.comment}
              onChange={markDirty}
              placeholder="この外部コンテンツの紹介・コメント"
              className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="tipsEnabled"
              value="true"
              defaultChecked={initial.tipsEnabled}
              onChange={markDirty}
              className="h-4 w-4"
            />
            投げ銭を受け付ける（紹介・コメント・キュレーションへの任意の価値送信）
          </label>
          <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
            ※ この投げ銭は外部コンテンツそのものの購入ではなく、投稿者による紹介・コメント・キュレーションへの任意の価値送信です。
            外部URL投稿では販売公開は利用できません（販売できるのは自身が作成した記事のみ）。
          </p>

          <div className="rounded-md bg-yellow-50 p-3 text-xs text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
            <p>
              外部コンテンツのURLを共有する場合、リンク先コンテンツの著作権・利用条件を確認してください。
              本投稿では外部コンテンツそのものを販売することはできません。引用・紹介・コメントの範囲で投稿してください。
            </p>
            <label className="mt-2 flex items-start gap-2">
              <input type="checkbox" name="copyright1" value="true" className="mt-0.5" onChange={markDirty} />
              外部コンテンツの権利を確認し、リンク共有として投稿します。
            </label>
            <label className="mt-1 flex items-start gap-2">
              <input type="checkbox" name="copyright2" value="true" className="mt-0.5" onChange={markDirty} />
              外部コンテンツそのものを販売しないことを理解しました。
            </label>
          </div>
        </div>
      )}

      {/* ===== 通常記事 ===== */}
      {!isUrl && (
        <>
          <input type="hidden" name="contentHTML" value={contentHTML} />
          <input type="hidden" name="coverImage" value={coverImage} />
          <input type="hidden" name="paidHtml" value={paidHtml} />
          <input type="hidden" name="paid" value={paid ? "true" : "false"} />

          <div className="flex flex-col gap-2 text-sm">
            <span>カバー画像</span>
            {coverImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverImage}
                alt="カバー画像"
                className="max-h-96 w-full rounded-md border border-gray-200 bg-gray-100 object-contain dark:border-gray-700 dark:bg-gray-800"
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

          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="mb-1 font-semibold">公開方式</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="publishMode" checked={!paid} onChange={() => { setPaid(false); markDirty(); }} />
              通常公開（全文を無料公開）
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="publishMode" checked={paid} onChange={() => { setPaid(true); markDirty(); }} />
              販売公開（試し読み＋有料の全文）
            </label>
          </fieldset>

          {paid && (
            <div className="flex flex-col gap-4 rounded-lg border border-amber-300 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="text-sm font-semibold">販売設定</p>
              <div className="flex flex-col gap-1 text-sm">
                <span>有料部分（購入者のみ閲覧）</span>
                <TiptapEditor
                  initialHTML={initial.paidHtml}
                  onChange={(html) => { setPaidHtml(html); setDirty(true); }}
                />
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex flex-col gap-1 text-sm">
                  販売価格
                  <input type="number" name="priceAmount" step="0.000001" min="0.000001" defaultValue={initial.priceAmount} onChange={markDirty} className="w-32 rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  通貨・モザイク
                  <select name="priceCurrency" defaultValue={initial.priceCurrency || "XYM"} onChange={markDirty} className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
                    <option value="XYM">XYM</option>
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                販売者アドレス（受取先）
                <input type="text" name="sellerAddress" defaultValue={initial.sellerAddress || initial.defaultSellerAddress} onChange={markDirty} placeholder="T..." className="rounded-md border border-gray-300 px-3 py-2 font-mono text-xs dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <div className="rounded-md bg-yellow-100 px-3 py-2 text-xs text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
                有料記事・購読権の販売を事業として行う場合は、プロフィール欄に「特定商取引法に基づく表記」および「利用規約・販売条件」を記載し、販売者自身の責任で必要な法令対応を行ってください。
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="consent" value="true" className="mt-1" />
                <span>有料記事・購読権の販売に関する必要な法令対応は、販売者である投稿者自身の責任で行います。</span>
              </label>
            </div>
          )}
        </>
      )}

      {/* 公開日時（共通） */}
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

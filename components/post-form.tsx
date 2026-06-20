"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { savePost, type PostFormState } from "@/app/posts/actions";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { TagInput, type TagInputHandle } from "@/components/tag-input";

type Ogp = {
  title: string;
  description: string;
  imageUrl: string;
  siteName: string;
  url: string;
};

// Canvas でテキストを最大幅に収まるよう行分割する（日本語は単語境界が無いため1文字ずつ）。
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of [...text]) {
    if (ch === "\n") {
      lines.push(line);
      line = "";
      continue;
    }
    const test = line + ch;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

type PostInitial = {
  id?: string;
  postType: "article" | "external_url" | "qa";
  title: string;
  authorName: string;
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
  pollOptions: string[];
  pollClosesAt: string;
  // 既に投票があるアンケートは選択肢を変更できない（票の整合性保護）。
  pollLocked: boolean;
};

const POLL_MAX_OPTIONS = 10;

const initialState: PostFormState = {};

export function PostForm({ initial }: { initial: PostInitial }) {
  const [state, formAction, pending] = useActionState(savePost, initialState);

  const [postType, setPostType] = useState(initial.postType);
  const isUrl = postType === "external_url";
  const isQa = postType === "qa";
  const isArticle = postType === "article";

  const [title, setTitle] = useState(initial.title);
  const [contentHTML, setContentHTML] = useState(initial.contentHTML);
  const [paidHtml, setPaidHtml] = useState(initial.paidHtml);
  const [paid, setPaid] = useState(initial.paid);
  const [coverImage, setCoverImage] = useState(initial.coverImage);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverGenerating, setCoverGenerating] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<TagInputHandle>(null);

  // URL投稿
  const [url, setUrl] = useState(initial.url);
  const [ogp, setOgp] = useState<Ogp | null>(initial.ogp);
  const [ogpLoading, setOgpLoading] = useState(false);
  const [ogpError, setOgpError] = useState<string | null>(null);

  const [dirty, setDirty] = useState(false);
  const markDirty = () => setDirty(true);

  // アンケート（任意・全投稿タイプ）。空の選択肢は送信時に除外される。
  const [pollOptions, setPollOptions] = useState<string[]>(
    initial.pollOptions.length > 0 ? initial.pollOptions : [""]
  );
  const [pollClosesAt, setPollClosesAt] = useState(initial.pollClosesAt);
  const filledPollOptions = pollOptions.map((o) => o.trim()).filter(Boolean);

  const setPollOption = (i: number, v: string) => {
    setPollOptions((prev) => prev.map((o, idx) => (idx === i ? v : o)));
    markDirty();
  };
  const addPollOption = () => {
    setPollOptions((prev) =>
      prev.length >= POLL_MAX_OPTIONS ? prev : [...prev, ""]
    );
    markDirty();
  };
  const removePollOption = (i: number) => {
    setPollOptions((prev) => prev.filter((_, idx) => idx !== i));
    markDirty();
  };
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

  // タイトルテキストを画像化してカバー画像にする（Harbor明記・右下にユーザー名）。
  async function generateCoverFromTitle() {
    const t = title.trim();
    if (!t) {
      setCoverError("タイトルを入力してから生成してください");
      return;
    }
    setCoverError(null);
    setCoverGenerating(true);
    try {
      const W = 1200;
      const H = 630;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("この環境では画像生成に対応していません");

      const font =
        '"Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, "Helvetica Neue", Arial, sans-serif';

      // 背景: Harbor ブランドのティールのグラデーション。
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, "#02c39a");
      grad.addColorStop(1, "#015c49");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      const pad = 72;
      const maxWidth = W - pad * 2;
      const areaTop = 140;
      const areaBottom = H - 120;
      const areaH = areaBottom - areaTop;

      // 収まる最大フォントサイズを選ぶ。
      const sizes = [78, 70, 62, 54, 46, 40];
      let fontSize = sizes[sizes.length - 1];
      let lines: string[] = [];
      for (const size of sizes) {
        ctx.font = `bold ${size}px ${font}`;
        const ls = wrapLines(ctx, t, maxWidth);
        if (ls.length * (size * 1.3) <= areaH) {
          fontSize = size;
          lines = ls;
          break;
        }
        fontSize = size;
        lines = ls;
      }
      // それでも溢れる場合は行数を制限し末尾を「…」に。
      const lineHeight = fontSize * 1.3;
      const maxLines = Math.max(1, Math.floor(areaH / lineHeight));
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        const last = lines.length - 1;
        lines[last] = lines[last].replace(/.$/, "…");
      }

      // タイトル本文（中央寄せ・左揃え）。
      ctx.font = `bold ${fontSize}px ${font}`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const blockH = lines.length * lineHeight;
      let y = areaTop + (areaH - blockH) / 2 + lineHeight / 2;
      for (const line of lines) {
        ctx.fillText(line, pad, y);
        y += lineHeight;
      }

      // 左上: Harbor ワードマーク。
      ctx.font = `600 32px ${font}`;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("⚓ Harbor", pad, 56);

      // 右下: ユーザー名のみ（小さめ）。Harbor は左上に明記済み。
      if (initial.authorName) {
        ctx.font = `500 27px ${font}`;
        ctx.fillStyle = "rgba(255,255,255,0.88)";
        ctx.textAlign = "right";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(initial.authorName, W - pad, H - 56);
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png")
      );
      if (!blob) throw new Error("画像の生成に失敗しました");

      const file = new File([blob], "title-cover.png", { type: "image/png" });
      const body = new FormData();
      body.append("file", file);
      body.append("prefix", "covers");
      const res = await fetch("/api/upload", { method: "POST", body });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "アップロードに失敗しました");
      }
      const { url: u } = (await res.json()) as { url: string };
      setCoverImage(u);
      setDirty(true);
    } catch (e) {
      setCoverError(e instanceof Error ? e.message : "生成に失敗しました");
    } finally {
      setCoverGenerating(false);
    }
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
    // 取得元の正規化ドメイン（www除去・小文字化）を削除可能なタグ候補として追加。
    // 表記ブレを抑える狙い。既存・重複・上限超過時は TagInput 側で無視される。
    try {
      const host = new URL(url.trim()).hostname
        .replace(/^www\./, "")
        .toLowerCase();
      if (host) tagInputRef.current?.addTag(host);
    } catch {
      /* URL生成失敗時は何もしない */
    }
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
            checked={isArticle}
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
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="postTypeRadio"
            checked={isQa}
            onChange={() => {
              setPostType("qa");
              setPaid(false);
              markDirty();
            }}
          />
          QA（質問を投稿して回答を募る）
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
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              markDirty();
            }}
            placeholder="記事のタイトル"
            className="rounded-md border border-gray-300 px-3 py-2 text-lg dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
      )}

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

      <TagInput
        ref={tagInputRef}
        name="tags"
        initialTags={initial.tags}
        onChange={markDirty}
      />

      {/* ===== 通常記事 ===== */}
      {!isUrl && (
        <>
          <input type="hidden" name="contentHTML" value={contentHTML} />
          <input type="hidden" name="coverImage" value={coverImage} />
          <input type="hidden" name="paidHtml" value={paidHtml} />
          <input
            type="hidden"
            name="paid"
            value={isArticle && paid ? "true" : "false"}
          />

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
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => coverRef.current?.click()}
                disabled={coverUploading || coverGenerating}
                className="rounded-md border border-gray-300 px-3 py-1.5 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
              >
                {coverUploading ? "アップロード中..." : "カバー画像を選択"}
              </button>
              <button
                type="button"
                onClick={generateCoverFromTitle}
                disabled={coverUploading || coverGenerating || !title.trim()}
                className="rounded-md border border-gray-300 px-3 py-1.5 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
              >
                {coverGenerating ? "生成中..." : "タイトルから生成"}
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
            <span>
              {isQa
                ? "質問の内容"
                : paid
                  ? "試し読み（無料で公開する部分）"
                  : "本文"}
            </span>
            <TiptapEditor
              initialHTML={initial.contentHTML}
              onChange={(html) => {
                setContentHTML(html);
                setDirty(true);
              }}
            />
          </div>

          {isArticle && (
          <>
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
        </>
      )}

      {/* アンケート（任意・全投稿タイプ共通） */}
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 font-semibold">アンケート（任意）</legend>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          選択肢を2つ以上入力すると投票を受け付けます（1人1票・投票後の変更不可）。空欄は無視されます。
        </p>

        {/* 送信用: 空欄を除いた選択肢を JSON で渡す（サーバーで再検証・正規化）。 */}
        <input
          type="hidden"
          name="pollOptions"
          value={JSON.stringify(filledPollOptions)}
        />

        {initial.pollLocked ? (
          <>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              ※ すでに投票があるため、選択肢は変更できません（締め切りのみ変更可）。
            </p>
            <ul className="flex flex-col gap-1">
              {pollOptions.map((o, i) => (
                <li
                  key={i}
                  className="rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  {o}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {pollOptions.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={o}
                    maxLength={80}
                    onChange={(e) => setPollOption(i, e.target.value)}
                    placeholder={`選択肢 ${i + 1}`}
                    className="flex-1 rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
                  />
                  {pollOptions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePollOption(i)}
                      className="shrink-0 text-xs text-gray-500 underline dark:text-gray-400"
                    >
                      削除
                    </button>
                  )}
                </div>
              ))}
            </div>
            {pollOptions.length < POLL_MAX_OPTIONS && (
              <button
                type="button"
                onClick={addPollOption}
                className="self-start rounded-md border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
              >
                選択肢を追加
              </button>
            )}
            {filledPollOptions.length === 1 && (
              <p className="text-xs text-red-600 dark:text-red-400">
                アンケートを使う場合は選択肢を2つ以上入力してください。
              </p>
            )}
          </>
        )}

        {filledPollOptions.length >= 2 && (
          <label className="mt-1 flex flex-col gap-1 text-sm">
            投票の締め切り（任意・空欄なら無期限）
            <input
              type="datetime-local"
              name="pollClosesAt"
              value={pollClosesAt}
              onChange={(e) => {
                setPollClosesAt(e.target.value);
                markDirty();
              }}
              className="w-64 rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
        )}
      </fieldset>

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

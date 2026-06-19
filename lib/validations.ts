import { z } from "zod";

// X(旧Twitter) のハンドル: 先頭 @ は任意、英数字とアンダースコア、1〜15文字。
const xHandleRegex = /^[A-Za-z0-9_]{1,15}$/;

export const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "表示名を入力してください")
    .max(50, "表示名は50文字以内にしてください"),
  bio: z
    .string()
    .trim()
    .max(500, "自己紹介は500文字以内にしてください")
    .optional()
    .or(z.literal("")),
  xAccount: z
    .string()
    .trim()
    .transform((v) => v.replace(/^@/, ""))
    .refine((v) => v === "" || xHandleRegex.test(v), {
      message: "Xのアカウント名が正しくありません（英数字とアンダースコア、15文字以内）",
    })
    .optional()
    .or(z.literal("")),
  avatarUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((v) => v === "" || v.startsWith("/uploads/") || /^https?:\/\//.test(v), {
      message: "アバターURLが不正です",
    })
    .optional()
    .or(z.literal("")),
  coverImage: z
    .string()
    .trim()
    .max(2048)
    .refine((v) => v === "" || v.startsWith("/uploads/") || /^https?:\/\//.test(v), {
      message: "カバー画像URLが不正です",
    })
    .optional()
    .or(z.literal("")),
  // メールは任意（ログインIDではない。通知・連絡用）
  email: z
    .string()
    .trim()
    .email("有効なメールアドレスを入力してください")
    .optional()
    .or(z.literal("")),
  emailNotificationsEnabled: z.boolean().optional().default(false),
  websiteUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((v) => v === "" || /^https:\/\//i.test(v), {
      message: "WebサイトURLは https:// で始めてください",
    })
    .optional()
    .or(z.literal("")),
  // 法務情報（HTML不可。表示時はエスケープする）
  tokushoho: z.string().max(5000, "特商法表記が長すぎます").optional().or(z.literal("")),
  salesTerms: z.string().max(5000, "販売条件が長すぎます").optional().or(z.literal("")),
});

export type ProfileInput = z.infer<typeof profileSchema>;

// 投げ銭・購入で許可する通貨（モザイク）。当面 XYM のみ。
export const ALLOWED_CURRENCIES = ["XYM"] as const;

const imageUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v === "" || v.startsWith("/uploads/") || /^https?:\/\//.test(v), {
    message: "画像URLが不正です",
  });

export const postSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "タイトルを入力してください")
    .max(200, "タイトルは200文字以内にしてください"),
  // contentHTML はサーバー側で必ずサニタイズしてから保存する。
  contentHTML: z
    .string()
    .max(200_000, "本文が長すぎます")
    .optional()
    .or(z.literal("")),
  coverImage: imageUrl.optional().or(z.literal("")),
  published: z.boolean(),
  tags: z
    .array(z.string().trim().min(1).max(30))
    .max(10, "タグは10個までです")
    .default([]),

  // 販売公開（有料記事）
  paid: z.boolean().default(false),
  paidHtml: z.string().max(200_000, "有料部分が長すぎます").optional().or(z.literal("")),
  priceAmount: z
    .number()
    .positive("価格は0より大きい値にしてください")
    .max(1_000_000, "価格が大きすぎます")
    .optional(),
  priceCurrency: z.enum(ALLOWED_CURRENCIES).optional(),
  sellerAddress: z
    .string()
    .trim()
    .regex(/^[A-Z2-7]{39}$/, "販売者アドレスの形式が正しくありません")
    .optional()
    .or(z.literal("")),
  // datetime-local 文字列。空なら即時公開扱い。
  publishAt: z.string().optional().or(z.literal("")),
});

export type PostInput = z.infer<typeof postSchema>;

// 購入記録の検証入力（txHash と postId のみ。検証はサーバーがノードで行う）。
export const purchaseSchema = z.object({
  postId: z.string().min(1),
  txHash: z.string().regex(/^[0-9A-Fa-f]{64}$/, "txHash の形式が正しくありません"),
});

export type PurchaseInput = z.infer<typeof purchaseSchema>;

// Thanks 送信記録の検証入力（検証はサーバーがノードで行う）。
export const thanksApiSchema = z.object({
  reactionId: z.string().min(1),
  thanksType: z.enum(["thanks", "super_thanks"]),
  txHash: z.string().regex(/^[0-9A-Fa-f]{64}$/, "txHash の形式が正しくありません"),
});

export type ThanksApiInput = z.infer<typeof thanksApiSchema>;

// タグ配列に正規化する。
// フォームからは JSON 配列文字列（チップ入力）で渡る。旧来のカンマ/空白区切りにも対応。
export function parseTags(raw: unknown): string[] {
  let list: string[] = [];
  if (Array.isArray(raw)) {
    list = raw.map((t) => String(t));
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      try {
        const arr: unknown = JSON.parse(trimmed);
        if (Array.isArray(arr)) list = arr.map((t) => String(t));
      } catch {
        list = [];
      }
    } else {
      list = trimmed.split(/[,、\s]+/);
    }
  }
  const normalized = list.map((t) => t.trim().slice(0, 30)).filter(Boolean);
  return [...new Set(normalized)].slice(0, 10);
}

export const commentSchema = z.object({
  postId: z.string().min(1),
  body: z
    .string()
    .trim()
    .min(1, "コメントを入力してください")
    .max(1000, "コメントは1000文字以内にしてください"),
});

export type CommentInput = z.infer<typeof commentSchema>;

// Symbol の公開アドレス（plain 形式・39文字の base32）。
// サーバーが受け取ってよいウォレット関連情報はこの公開アドレスのみ。
export const walletAddressSchema = z.object({
  address: z
    .string()
    .trim()
    .regex(/^[A-Z2-7]{39}$/, "Symbol アドレスの形式が正しくありません"),
});

export type WalletAddressInput = z.infer<typeof walletAddressSchema>;

// 投げ銭の記録。toAddress はサーバー側で記事著者から決めるため受け取らない。
export const tipSchema = z.object({
  postId: z.string().min(1),
  txHash: z.string().regex(/^[0-9A-Fa-f]{64}$/, "txHash の形式が正しくありません"),
  fromAddress: z
    .string()
    .trim()
    .regex(/^[A-Z2-7]{39}$/, "送信元アドレスの形式が正しくありません"),
  amount: z
    .number()
    .min(0.1, "投げ銭額は0.1XYM以上です")
    .max(10, "投げ銭額は10XYM以下です"),
  anonymous: z.boolean().optional().default(false),
});

export type TipInput = z.infer<typeof tipSchema>;

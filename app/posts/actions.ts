"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizePostHtml } from "@/lib/sanitize";
import { parseTags, postSchema } from "@/lib/validations";

export type PostFormState = {
  error?: string;
};

// 記事の作成・更新（要ログイン、更新は本人のみ）。
// contentHTML は必ずサーバー側でサニタイズしてから保存する。
export async function savePost(
  _prevState: PostFormState,
  formData: FormData
): Promise<PostFormState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "認証が必要です。再度ログインしてください。" };
  }

  const userId = session.user.id;
  const postId = formData.get("postId");
  // 条件付きで描画されるフィールドは未送信時 null になるため "" に正規化する。
  const str = (key: string): string => {
    const v = formData.get(key);
    return typeof v === "string" ? v : "";
  };

  const tags = parseTags(formData.get("tags"));
  const published = formData.get("published") === "true";
  const publishAtRaw = str("publishAt");
  let publishAtDate: Date | null = null;
  if (publishAtRaw.trim() !== "") {
    const d = new Date(publishAtRaw);
    if (!Number.isNaN(d.getTime())) publishAtDate = d;
  }

  // 所有権チェック付きの保存（作成/更新を共通化）。
  const persist = async (
    data: Prisma.PostUncheckedCreateInput
  ): Promise<PostFormState | null> => {
    if (typeof postId === "string" && postId.length > 0) {
      const existing = await prisma.post.findUnique({
        where: { id: postId },
        select: { authorId: true },
      });
      if (!existing) return { error: "記事が見つかりません" };
      if (existing.authorId !== userId) {
        return { error: "この記事を編集する権限がありません" };
      }
      await prisma.post.update({ where: { id: postId }, data });
    } else {
      await prisma.post.create({ data });
    }
    return null;
  };

  // ===== 外部URL共有投稿 =====
  if (str("postType") === "external_url") {
    const url = str("url").trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      return { error: "有効なURL（http/https）を入力してください。" };
    }
    if (
      formData.get("copyright1") !== "true" ||
      formData.get("copyright2") !== "true"
    ) {
      return { error: "著作権・権利確認のチェックが必要です。" };
    }
    const ogpTitle = str("ogpTitle").slice(0, 300);
    let ogpImageUrl = str("ogpImageUrl").trim();
    if (!/^https?:\/\//i.test(ogpImageUrl)) ogpImageUrl = "";
    const title = (ogpTitle || url).slice(0, 200);

    const err = await persist({
      authorId: userId,
      postType: "external_url",
      title,
      contentHTML: "",
      coverImage: null,
      url,
      comment: str("comment").trim().slice(0, 2000) || null,
      ogpTitle: ogpTitle || null,
      ogpDescription: str("ogpDescription").slice(0, 600) || null,
      ogpImageUrl: ogpImageUrl || null,
      ogpSiteName: str("ogpSiteName").slice(0, 200) || null,
      tipsEnabled: formData.get("tipsEnabled") === "true",
      // URL投稿は販売不可
      paid: false,
      paidHtml: null,
      priceAmount: null,
      priceCurrency: null,
      sellerAddress: null,
      published,
      tags,
      publishAt: publishAtDate,
    }).catch((e) => {
      console.error("savePost(url) error", e);
      return { error: "投稿の保存に失敗しました" } as PostFormState;
    });
    if (err) return err;
    revalidatePath("/dashboard");
    redirect("/dashboard");
  }

  // ===== 通常記事 =====
  const priceRaw = formData.get("priceAmount");
  const priceAmount =
    typeof priceRaw === "string" && priceRaw.trim() !== ""
      ? Number(priceRaw)
      : undefined;
  const parsed = postSchema.safeParse({
    title: str("title"),
    contentHTML: str("contentHTML"),
    coverImage: str("coverImage"),
    published,
    tags,
    paid: formData.get("paid") === "true",
    paidHtml: str("paidHtml"),
    priceAmount,
    priceCurrency: str("priceCurrency") || undefined,
    sellerAddress: str("sellerAddress"),
    publishAt: publishAtRaw,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }

  const { title, contentHTML, coverImage, paid, paidHtml, priceCurrency } =
    parsed.data;
  const safeHtml = sanitizePostHtml(contentHTML ?? "");
  const cover = coverImage ? coverImage : null;

  // 販売公開の追加バリデーション
  let saleData: {
    paid: boolean;
    paidHtml: string | null;
    priceAmount: number | null;
    priceCurrency: string | null;
    sellerAddress: string | null;
  };
  if (paid) {
    if (formData.get("consent") !== "true") {
      return {
        error: "販売公開には法令対応に関する同意（チェック）が必要です。",
      };
    }
    if (!parsed.data.priceAmount || parsed.data.priceAmount <= 0) {
      return { error: "販売価格を0より大きい値で設定してください。" };
    }
    let seller = parsed.data.sellerAddress || "";
    if (!seller) {
      const me = await prisma.user.findUnique({
        where: { id: userId },
        select: { xymAddress: true },
      });
      seller = me?.xymAddress ?? "";
    }
    if (!/^[A-Z2-7]{39}$/.test(seller)) {
      return {
        error:
          "販売者アドレスが未設定です。ウォレットを作成・登録するか、アドレスを入力してください。",
      };
    }
    saleData = {
      paid: true,
      paidHtml: sanitizePostHtml(paidHtml ?? ""),
      priceAmount: parsed.data.priceAmount,
      priceCurrency: priceCurrency ?? "XYM",
      sellerAddress: seller,
    };
  } else {
    saleData = {
      paid: false,
      paidHtml: null,
      priceAmount: null,
      priceCurrency: null,
      sellerAddress: null,
    };
  }

  const err = await persist({
    authorId: userId,
    postType: "article",
    title,
    contentHTML: safeHtml,
    coverImage: cover,
    url: null,
    comment: null,
    ogpTitle: null,
    ogpDescription: null,
    ogpImageUrl: null,
    ogpSiteName: null,
    tipsEnabled: true,
    published,
    tags,
    publishAt: publishAtDate,
    ...saleData,
  }).catch((e) => {
    console.error("savePost error", e);
    return { error: "記事の保存に失敗しました" } as PostFormState;
  });
  if (err) return err;

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

// 記事削除（本人のみ）。
export async function deletePost(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/dashboard");
  }

  const postId = formData.get("postId");
  if (typeof postId !== "string" || postId.length === 0) {
    return;
  }

  const existing = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true },
  });
  if (!existing || existing.authorId !== session.user.id) {
    return;
  }

  await prisma.post.delete({ where: { id: postId } });
  revalidatePath("/dashboard");
}

// 公開/非公開の切り替え（本人のみ）。
export async function togglePublish(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/dashboard");
  }

  const postId = formData.get("postId");
  if (typeof postId !== "string" || postId.length === 0) {
    return;
  }

  const existing = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true, published: true },
  });
  if (!existing || existing.authorId !== session.user.id) {
    return;
  }

  await prisma.post.update({
    where: { id: postId },
    data: { published: !existing.published },
  });
  revalidatePath("/dashboard");
}

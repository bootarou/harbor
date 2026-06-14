"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

  const postId = formData.get("postId");
  const priceRaw = formData.get("priceAmount");
  const priceAmount =
    typeof priceRaw === "string" && priceRaw.trim() !== ""
      ? Number(priceRaw)
      : undefined;
  // 条件付きで描画されるフィールドは未送信時 null になるため "" に正規化する。
  const str = (key: string): string => {
    const v = formData.get(key);
    return typeof v === "string" ? v : "";
  };
  const parsed = postSchema.safeParse({
    title: str("title"),
    contentHTML: str("contentHTML"),
    coverImage: str("coverImage"),
    published: formData.get("published") === "true",
    tags: parseTags(formData.get("tags")),
    paid: formData.get("paid") === "true",
    paidHtml: str("paidHtml"),
    priceAmount,
    priceCurrency: str("priceCurrency") || undefined,
    sellerAddress: str("sellerAddress"),
    publishAt: str("publishAt"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }

  const {
    title,
    contentHTML,
    coverImage,
    published,
    tags,
    paid,
    paidHtml,
    priceCurrency,
    publishAt,
  } = parsed.data;
  const safeHtml = sanitizePostHtml(contentHTML ?? "");
  const cover = coverImage ? coverImage : null;

  // 公開日時（datetime-local）→ Date。空/不正なら null（即時公開）。
  let publishAtDate: Date | null = null;
  if (publishAt && publishAt.trim() !== "") {
    const d = new Date(publishAt);
    if (!Number.isNaN(d.getTime())) publishAtDate = d;
  }

  // 販売公開の追加バリデーション
  let saleData: {
    paid: boolean;
    paidHtml: string | null;
    priceAmount: number | null;
    priceCurrency: string | null;
    sellerAddress: string | null;
  };
  if (paid) {
    // 法令対応の同意（販売公開時のみ必須）
    if (formData.get("consent") !== "true") {
      return {
        error: "販売公開には法令対応に関する同意（チェック）が必要です。",
      };
    }
    if (!parsed.data.priceAmount || parsed.data.priceAmount <= 0) {
      return { error: "販売価格を0より大きい値で設定してください。" };
    }
    // 販売者アドレス（未指定なら自分の登録アドレスを使用）
    let seller = parsed.data.sellerAddress || "";
    if (!seller) {
      const me = await prisma.user.findUnique({
        where: { id: session.user.id },
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

  try {
    if (typeof postId === "string" && postId.length > 0) {
      const existing = await prisma.post.findUnique({
        where: { id: postId },
        select: { authorId: true },
      });
      if (!existing) {
        return { error: "記事が見つかりません" };
      }
      if (existing.authorId !== session.user.id) {
        return { error: "この記事を編集する権限がありません" };
      }
      await prisma.post.update({
        where: { id: postId },
        data: {
          title,
          contentHTML: safeHtml,
          coverImage: cover,
          published,
          tags,
          publishAt: publishAtDate,
          ...saleData,
        },
      });
    } else {
      await prisma.post.create({
        data: {
          authorId: session.user.id,
          title,
          contentHTML: safeHtml,
          coverImage: cover,
          published,
          tags,
          publishAt: publishAtDate,
          ...saleData,
        },
      });
    }
  } catch (error) {
    console.error("savePost error", error);
    return { error: "記事の保存に失敗しました" };
  }

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

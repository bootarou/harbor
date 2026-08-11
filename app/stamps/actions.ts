"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stampSchema } from "@/lib/validations";
import { notify } from "@/lib/notifications";

export type StampFormState = {
  error?: string;
  success?: { id: string };
};

// スタンプの作成/更新（本人のみ）。著作権確認チェックを必須にする。
export async function saveStamp(
  _prev: StampFormState,
  formData: FormData
): Promise<StampFormState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "ログインしてください。" };
  }
  const userId = session.user.id;

  // 著作権確認は作成・更新とも必須（他者の著作物の無断販売を防ぐ）。
  if (formData.get("copyright") !== "true") {
    return { error: "スタンプの著作権に関する確認にチェックしてください。" };
  }

  const priceRaw = formData.get("price");
  const parsed = stampSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    imageUrl: formData.get("imageUrl") ?? "",
    price: typeof priceRaw === "string" ? Number(priceRaw) : NaN,
    published: formData.get("published") === "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }
  const { name, description, imageUrl, price, published } = parsed.data;

  const stampId = formData.get("stampId");
  const data = {
    name,
    description: description ? description : null,
    imageUrl,
    price: new Prisma.Decimal(price),
    published,
  };

  try {
    if (typeof stampId === "string" && stampId.length > 0) {
      const existing = await prisma.stamp.findUnique({
        where: { id: stampId },
        select: { authorId: true },
      });
      if (!existing) return { error: "スタンプが見つかりません" };
      if (existing.authorId !== userId) {
        return { error: "このスタンプを編集する権限がありません" };
      }
      await prisma.stamp.update({ where: { id: stampId }, data });
      revalidatePath("/stamps/manage");
      return { success: { id: stampId } };
    }
    const created = await prisma.stamp.create({
      data: { ...data, authorId: userId },
      select: { id: true },
    });
    revalidatePath("/stamps/manage");
    return { success: { id: created.id } };
  } catch (e) {
    console.error("saveStamp error", e);
    return { error: "スタンプの保存に失敗しました" };
  }
}

// 公開/非公開の切り替え（本人のみ）。
export async function toggleStampPublish(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/stamps/manage");
  const stampId = formData.get("stampId");
  if (typeof stampId !== "string" || !stampId) return;

  const existing = await prisma.stamp.findUnique({
    where: { id: stampId },
    select: { authorId: true, published: true },
  });
  if (!existing || existing.authorId !== session.user!.id) return;

  await prisma.stamp.update({
    where: { id: stampId },
    data: { published: !existing.published },
  });
  revalidatePath("/stamps/manage");
}

// スタンプ削除（本人のみ）。購入実績があるスタンプは削除不可（購入者・記録の保護）。
// 販売を止めたい場合は「非公開」にする。
export async function deleteStamp(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/stamps/manage");
  const stampId = formData.get("stampId");
  if (typeof stampId !== "string" || !stampId) return;

  const existing = await prisma.stamp.findUnique({
    where: { id: stampId },
    select: { authorId: true, _count: { select: { purchases: true } } },
  });
  if (!existing || existing.authorId !== session.user!.id) return;
  // 購入者がいるスタンプは削除しない（記録保全・購入者保護）。
  if (existing._count.purchases > 0) return;

  await prisma.stamp.delete({ where: { id: stampId } });
  revalidatePath("/stamps/manage");
}

// スタンプを記事に貼る（送金なし・即時）。
// 使用権を持つ（購入済み confirmed、またはスタンプ作者本人）ユーザーのみ。
export async function placeStamp(
  stampId: string,
  postId: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "ログインしてください。" };
  const userId = session.user.id;

  const [stamp, post] = await Promise.all([
    prisma.stamp.findUnique({
      where: { id: stampId },
      select: { id: true, authorId: true, name: true, published: true },
    }),
    prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, title: true, published: true, deletedAt: true },
    }),
  ]);
  if (!stamp || !post) return { ok: false, error: "対象が見つかりません" };
  if (post.deletedAt || (!post.published && post.authorId !== userId)) {
    return { ok: false, error: "この記事にはスタンプを貼れません" };
  }

  // 使用権の確認: スタンプ作者本人、または購入済み(confirmed)。
  const isStampAuthor = stamp.authorId === userId;
  if (!isStampAuthor) {
    const owned = await prisma.stampPurchase.findFirst({
      where: { stampId, buyerId: userId, confirmed: true },
      select: { id: true },
    });
    if (!owned) return { ok: false, error: "このスタンプの使用権がありません" };
  }

  await prisma.stampPlacement.create({
    data: { stampId, postId, userId },
  });

  // 記事の著者へ通知（自分の記事への自分の貼り付けは除く）。
  if (post.authorId !== userId) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    await notify({
      userId: post.authorId,
      type: "stamp_placed",
      actorId: userId,
      actorName: me?.displayName ?? null,
      postId,
      postTitle: post.title,
    });
  }

  revalidatePath(`/posts/${postId}`);
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";

export type FollowState = { error?: string };

// フォロー（要ログイン・自分自身は不可）。
export async function followUser(
  _prevState: FollowState,
  formData: FormData
): Promise<FollowState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "ログインが必要です" };
  }
  const targetId = formData.get("targetId");
  if (typeof targetId !== "string" || !targetId) {
    return { error: "対象が不正です" };
  }
  if (targetId === session.user.id) {
    return { error: "自分自身はフォローできません" };
  }
  try {
    await prisma.follow.create({
      data: { followerId: session.user.id, followingId: targetId },
    });
    // フォローされた人へ通知（新規フォロー成立時のみ）。
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { displayName: true },
    });
    await notify({
      userId: targetId,
      type: "follow",
      actorId: session.user.id,
      actorName: me?.displayName ?? null,
    });
  } catch (e) {
    // 既にフォロー済み（unique 制約）は成功扱い
    if (
      !(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
    ) {
      console.error("followUser error", e);
      return { error: "フォローに失敗しました" };
    }
  }
  revalidatePath(`/users/${targetId}`);
  return {};
}

// フォロー解除。
export async function unfollowUser(
  _prevState: FollowState,
  formData: FormData
): Promise<FollowState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "ログインが必要です" };
  }
  const targetId = formData.get("targetId");
  if (typeof targetId !== "string" || !targetId) {
    return { error: "対象が不正です" };
  }
  await prisma.follow.deleteMany({
    where: { followerId: session.user.id, followingId: targetId },
  });
  revalidatePath(`/users/${targetId}`);
  return {};
}

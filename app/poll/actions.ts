"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// アンケートへの投票（要ログイン）。1ユーザーにつき各投稿で1票のみ。
// 投票後の変更・取り消しは不可（@@unique(postId,userId) と「既存票は無視」で担保）。
export async function voteOnPoll(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;

  const optionId = formData.get("optionId");
  if (typeof optionId !== "string" || optionId.length === 0) return;

  const option = await prisma.pollOption.findUnique({
    where: { id: optionId },
    select: {
      id: true,
      postId: true,
      post: { select: { published: true, publishAt: true, pollClosesAt: true } },
    },
  });
  if (!option) return;

  // 公開済み投稿のみ投票可（下書き・予約公開中は不可）。
  const post = option.post;
  const live =
    post.published && (!post.publishAt || post.publishAt.getTime() <= Date.now());
  if (!live) return;

  // 締め切りを過ぎたアンケートには投票できない。
  if (post.pollClosesAt && post.pollClosesAt.getTime() <= Date.now()) return;

  try {
    await prisma.pollVote.create({
      data: {
        postId: option.postId,
        optionId: option.id,
        userId: session.user.id,
      },
    });
  } catch {
    // @@unique(postId,userId) 違反 = 既に投票済み。1人1票のため無視する。
  }

  revalidatePath(`/posts/${option.postId}`);
}

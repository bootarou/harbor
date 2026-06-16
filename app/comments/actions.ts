"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { commentSchema } from "@/lib/validations";
import { notify } from "@/lib/notifications";

export type CommentFormState = {
  error?: string;
  success?: boolean;
};

// コメント投稿（要ログイン、公開記事のみ／著者は自身の非公開記事にも可）。
export async function addComment(
  _prevState: CommentFormState,
  formData: FormData
): Promise<CommentFormState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "コメントするにはログインしてください。" };
  }

  const parsed = commentSchema.safeParse({
    postId: formData.get("postId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }

  const { postId, body } = parsed.data;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { published: true, authorId: true, title: true },
  });
  if (!post) {
    return { error: "記事が見つかりません" };
  }
  if (!post.published && post.authorId !== session.user.id) {
    return { error: "この記事にはコメントできません" };
  }

  try {
    await prisma.comment.create({
      data: { postId, userId: session.user.id, body },
    });
  } catch (error) {
    console.error("addComment error", error);
    return { error: "コメントの投稿に失敗しました" };
  }

  // 著者へ通知（自分の記事への自分のコメントは除く）。
  if (post.authorId !== session.user.id) {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { displayName: true },
    });
    await notify({
      userId: post.authorId,
      type: "comment",
      actorId: session.user.id,
      actorName: me?.displayName ?? null,
      postId,
      postTitle: post.title,
    });
  }

  revalidatePath(`/posts/${postId}`);
  return { success: true };
}

// コメント削除（コメント投稿者 または 記事の著者 のみ）。
export async function deleteComment(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const commentId = formData.get("commentId");
  if (typeof commentId !== "string" || commentId.length === 0) {
    return;
  }

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { userId: true, postId: true, post: { select: { authorId: true } } },
  });
  if (!comment) {
    return;
  }

  const canDelete =
    comment.userId === session.user.id ||
    comment.post.authorId === session.user.id;
  if (!canDelete) {
    return;
  }

  await prisma.comment.delete({ where: { id: commentId } });
  revalidatePath(`/posts/${comment.postId}`);
}

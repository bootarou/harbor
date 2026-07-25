"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { commentSchema } from "@/lib/validations";
import { notify } from "@/lib/notifications";

export type CommentFormState = {
  error?: string;
  success?: boolean;
};

// クライアントから受け取ったメンション先 userId を、そのスレッドの参加者
// （記事著者＋その記事にコメントしたユーザー）に限定して検証する。
// 自分自身・重複・無関係ユーザーは除外し、実在＆参加者の userId だけを返す。
async function resolveMentions(
  raw: FormDataEntryValue | null,
  postId: string,
  authorId: string,
  selfId: string
): Promise<string[]> {
  if (typeof raw !== "string" || raw.length === 0) return [];
  let ids: unknown;
  try {
    ids = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(ids)) return [];
  const requested = new Set(
    ids.filter((v): v is string => typeof v === "string" && v.length > 0)
  );
  requested.delete(selfId); // 自分自身へのメンションは無視
  if (requested.size === 0) return [];

  // そのスレッドの参加者集合（著者＋コメント投稿者）。
  const commenters = await prisma.comment.findMany({
    where: { postId },
    select: { userId: true },
    distinct: ["userId"],
  });
  const participants = new Set<string>([authorId, ...commenters.map((c) => c.userId)]);
  participants.delete(selfId);

  return [...requested].filter((id) => participants.has(id));
}

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

  // メンション先 userId を受け取り、「そのスレッドの参加者（著者＋コメント投稿者）」
  // に限定して検証する。自分自身・重複は除外。改竄・無関係ユーザーへの通知を防ぐ。
  const mentions = await resolveMentions(
    formData.get("mentions"),
    postId,
    post.authorId,
    session.user.id
  );

  try {
    await prisma.comment.create({
      data: { postId, userId: session.user.id, body, mentions },
    });
  } catch (error) {
    console.error("addComment error", error);
    return { error: "コメントの投稿に失敗しました" };
  }

  // 通知作成・メール送信はユーザー応答をブロックしないよう after() でレスポンス後に実行する。
  // （notify() は SMTP 送信を含み得るため、直列に待つと「投稿中…」が長引く原因になる。）
  const actorId = session.user.id;
  after(async () => {
    try {
      const me = await prisma.user.findUnique({
        where: { id: actorId },
        select: { displayName: true },
      });
      const actorName = me?.displayName ?? null;

      const targets: { userId: string; type: "comment" | "mention" }[] = [];
      // 著者へ通知（自分の記事への自分のコメントは除く）。
      if (post.authorId !== actorId) {
        targets.push({ userId: post.authorId, type: "comment" });
      }
      // メンション先へ通知（著者本人は comment 通知と重複するため除外）。
      for (const uid of mentions) {
        if (uid === post.authorId) continue;
        targets.push({ userId: uid, type: "mention" });
      }

      // 受信者ごとに並列で通知（1件の失敗が他を止めないよう notify 内で握りつぶし済み）。
      await Promise.all(
        targets.map((t) =>
          notify({
            userId: t.userId,
            type: t.type,
            actorId,
            actorName,
            postId,
            postTitle: post.title,
          })
        )
      );
    } catch (e) {
      console.error("addComment notify(after) error", e);
    }
  });

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

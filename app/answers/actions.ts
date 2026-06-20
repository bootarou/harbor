"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizePostHtml, htmlToText } from "@/lib/sanitize";
import { answerSchema } from "@/lib/validations";
import { upsertLinkPreviewsFromHtml } from "@/lib/link-preview";
import { notify } from "@/lib/notifications";

export type AnswerFormState = {
  error?: string;
  success?: boolean;
};

// QA への回答投稿（要ログイン、postType="qa" の公開記事のみ／著者は自身の下書きにも可）。
// 回答本文は必ずサニタイズして保存する。
export async function addAnswer(
  _prevState: AnswerFormState,
  formData: FormData
): Promise<AnswerFormState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "回答するにはログインしてください。" };
  }

  const parsed = answerSchema.safeParse({
    postId: formData.get("postId"),
    contentHTML: formData.get("contentHTML"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }

  const { postId, contentHTML } = parsed.data;
  const safeHtml = sanitizePostHtml(contentHTML);
  // タグを除いた実テキストが空なら拒否（空白や空タグだけの投稿を防ぐ）。
  if (htmlToText(safeHtml, 1).length === 0) {
    return { error: "回答を入力してください" };
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { published: true, authorId: true, postType: true, title: true },
  });
  if (!post || post.postType !== "qa") {
    return { error: "質問が見つかりません" };
  }
  if (!post.published && post.authorId !== session.user.id) {
    return { error: "この質問には回答できません" };
  }

  try {
    await prisma.answer.create({
      data: { postId, authorId: session.user.id, contentHTML: safeHtml },
    });
  } catch (error) {
    console.error("addAnswer error", error);
    return { error: "回答の投稿に失敗しました" };
  }

  // 回答本文中のリンクカード（<a data-card>）の OGP をキャッシュ（表示時の外部取得を避ける）。
  await upsertLinkPreviewsFromHtml([safeHtml]).catch((e) =>
    console.error("answer link preview cache error", e)
  );

  revalidatePath(`/posts/${postId}`);
  return { success: true };
}

// ベストアンサーの選定（質問者本人のみ）。
// 選んだ回答を isBest=true（他は false）にし、Post.qaStatus を "answered" に更新、
// 回答者へ通知する。
export async function selectBestAnswer(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;

  const answerId = formData.get("answerId");
  if (typeof answerId !== "string" || answerId.length === 0) return;

  const answer = await prisma.answer.findUnique({
    where: { id: answerId },
    select: {
      id: true,
      authorId: true,
      postId: true,
      post: {
        select: { authorId: true, postType: true, title: true },
      },
    },
  });
  if (!answer || answer.post.postType !== "qa") return;
  // 質問者本人のみがベストアンサーを選べる。
  if (answer.post.authorId !== session.user.id) return;

  // 同一質問内のベストアンサーを付け替え、質問の状態を解決済みに更新する。
  await prisma.$transaction([
    prisma.answer.updateMany({
      where: { postId: answer.postId, isBest: true },
      data: { isBest: false },
    }),
    prisma.answer.update({
      where: { id: answer.id },
      data: { isBest: true },
    }),
    prisma.post.update({
      where: { id: answer.postId },
      data: { qaStatus: "answered" },
    }),
  ]);

  // 回答者へ通知（自分の回答を選んだ場合は通知しない）。
  if (answer.authorId !== session.user.id) {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { displayName: true },
    });
    await notify({
      userId: answer.authorId,
      type: "qa_best_answer",
      actorId: session.user.id,
      actorName: me?.displayName ?? null,
      postId: answer.postId,
      postTitle: answer.post.title,
    });
  }

  revalidatePath(`/posts/${answer.postId}`);
}

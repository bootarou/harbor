import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/ratelimit";

const NOTIFY_EMAIL =
  process.env.REPORT_NOTIFY_EMAIL || "bootarouapp@gmail.com";

// 記事の通報。記録し、運営の通知先メールへ詳細を送る（要ログイン）。
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "通報するにはログインしてください" },
      { status: 401 }
    );
  }

  // 通報はメール送信を伴うため厳しめに制限（メール爆撃対策）。ユーザー＋IP 両方。
  const userRl = rateLimit(`report:u:${session.user.id}`, 5, 60 * 60 * 1000);
  if (!userRl.ok) return tooManyRequests(userRl.retryAfter);
  const ipRl = rateLimit(`report:ip:${getClientIp(request)}`, 10, 60 * 60 * 1000);
  if (!ipRl.ok) return tooManyRequests(ipRl.retryAfter);

  const body = (await request.json().catch(() => null)) as {
    postId?: string;
    reason?: string;
  } | null;
  const postId = body?.postId?.trim() ?? "";
  const reason = (body?.reason ?? "").trim().slice(0, 1000);
  if (!postId) {
    return NextResponse.json({ error: "対象が不正です" }, { status: 400 });
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      title: true,
      postType: true,
      url: true,
      createdAt: true,
      author: {
        select: { id: true, displayName: true, symbolAddress: true },
      },
    },
  });
  if (!post) {
    return NextResponse.json({ error: "記事が見つかりません" }, { status: 404 });
  }

  const reporter = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, displayName: true, symbolAddress: true },
  });

  // 記録（同一ユーザーの重複通報は1件に）
  try {
    await prisma.report.create({
      data: { postId, reporterUserId: session.user.id, reason: reason || null },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return NextResponse.json({ ok: true, alreadyReported: true });
    }
    console.error("create report error", e);
    return NextResponse.json({ error: "通報の記録に失敗しました" }, { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const text = [
    "Harbor で記事が通報されました。",
    "",
    `■ 記事`,
    `  タイトル: ${post.title}`,
    `  記事ID: ${post.id}`,
    `  URL: ${siteUrl}/posts/${post.id}`,
    `  種別: ${post.postType}`,
    post.url ? `  外部URL: ${post.url}` : "",
    `  投稿日時: ${post.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
    "",
    `■ 投稿者`,
    `  表示名: ${post.author.displayName}`,
    `  ユーザーID: ${post.author.id}`,
    `  アドレス: ${post.author.symbolAddress ?? "-"}`,
    "",
    `■ 通報者`,
    `  表示名: ${reporter?.displayName ?? "-"}`,
    `  ユーザーID: ${reporter?.id ?? "-"}`,
    `  アドレス: ${reporter?.symbolAddress ?? "-"}`,
    "",
    `■ 理由`,
    `  ${reason || "(未記入)"}`,
    "",
    `通報日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  try {
    await sendEmail({
      to: NOTIFY_EMAIL,
      subject: `[Harbor] 記事が通報されました: ${post.title}`,
      text,
    });
  } catch (e) {
    // メール失敗でも通報記録は成立しているので 200 を返す
    console.error("report email error", e);
  }

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchSmd } from "@/lib/smd";
import { authLog } from "@/lib/audit";

// SMD をプロフィールへ適用（要ログイン・本人のアドレスのみ・項目別選択）。
// クライアント申告の値は使わず、サーバーが本人アドレスの SMD を再取得して適用する。
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    applyName?: boolean;
    applyImageUrl?: boolean;
    applyUrl?: boolean;
    applyNamespace?: boolean;
  } | null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { symbolAddress: true },
  });
  if (!user?.symbolAddress) {
    return NextResponse.json({ error: "Symbol アドレスが未設定です" }, { status: 400 });
  }

  const result = await fetchSmd(user.symbolAddress);
  if (result.status !== "ok") {
    return NextResponse.json(
      { error: "適用できる SMD が見つかりませんでした", smd: result },
      { status: 404 }
    );
  }
  const c = result.candidate;

  const data: Record<string, string> = {};
  if (body?.applyName && c.name) data.displayName = c.name;
  if (body?.applyImageUrl && c.imageUrl) data.avatarUrl = c.imageUrl;
  if (body?.applyUrl && c.url) data.websiteUrl = c.url;
  if (body?.applyNamespace && c.namespace) data.symbolNamespace = c.namespace;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "適用する項目がありません" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { ...data, profileSource: "smd", smdSyncedAt: new Date() },
  });
  await authLog("smd_synced", {
    userId: session.user.id,
    address: user.symbolAddress,
    detail: Object.keys(data).join(","),
  });

  return NextResponse.json({ ok: true, applied: Object.keys(data) });
}

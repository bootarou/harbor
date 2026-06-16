import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ヘッダーのベル用: 未読通知数。
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ count: 0 });
  }
  const count = await prisma.notification.count({
    where: { userId: session.user.id, read: false },
  });
  return NextResponse.json({ count });
}

import { NextResponse } from "next/server";
import { getMessagesAfter } from "@/lib/community";

// トピックの新着メッセージ差分を返す（?after=ISO 以降・hidden=false・昇順）。閲覧は誰でも可。
export async function GET(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const { topicId } = await params;
  const url = new URL(request.url);
  const afterRaw = url.searchParams.get("after");
  const after = afterRaw ? new Date(afterRaw) : null;
  if (!after || Number.isNaN(after.getTime())) {
    return NextResponse.json({ error: "after が不正です" }, { status: 400 });
  }
  const messages = await getMessagesAfter(topicId, after);
  return NextResponse.json({ messages });
}

import { NextResponse } from "next/server";
import { fetchSmd } from "@/lib/smd";

// SMD プレビュー取得（公開チェーンデータ）。インポート時の候補表示・手動同期に使用。
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address")?.trim() ?? "";
  if (!/^[A-Z2-7]{39}$/.test(address)) {
    return NextResponse.json(
      { error: "アドレスの形式が正しくありません" },
      { status: 400 }
    );
  }
  const result = await fetchSmd(address);
  return NextResponse.json(result);
}

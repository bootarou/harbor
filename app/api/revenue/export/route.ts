import { auth } from "@/lib/auth";
import { getRevenueRecords, type RevenueFilter } from "@/lib/sales/query";
import { formatXym } from "@/lib/format";

// 収益管理 CSV（販売・投げ銭受取・Thanks受取・Thanks送信）。会計・税務の参考用。
// クエリ(from,to,status)でフィルタ可。円換算は記録時点レートによる参考値。
function csvField(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
function jstIso(d: Date): string {
  return d.toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("認証が必要です", { status: 401 });
  }

  const sp = new URL(request.url).searchParams;
  const status = sp.get("status");
  const filter: RevenueFilter = {
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    status: status === "confirmed" ? "confirmed" : "all",
  };

  const records = await getRevenueRecords(session.user.id, filter);

  const header = [
    "日時(JST)",
    "区分", // 受取/送信
    "種別",
    "記事タイトル",
    "数量",
    "通貨",
    "レート(JPY/XYM)",
    "円換算額(取引時)",
    "相手アドレス",
    "txHash",
    "状態",
  ];
  const lines = [header.join(",")];
  for (const r of records) {
    lines.push(
      [
        jstIso(r.date),
        r.direction === "in" ? "受取" : "送信",
        r.label,
        r.title,
        formatXym(r.amount),
        r.currency,
        r.jpyRate != null ? String(r.jpyRate) : "",
        r.jpyValue != null ? String(Math.round(r.jpyValue)) : "",
        r.counterparty,
        r.txHash,
        r.confirmed ? "確定" : "確認中",
      ]
        .map((v) => csvField(v))
        .join(",")
    );
  }
  const csv = "﻿" + lines.join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="harbor-revenue-${jstIso(new Date()).slice(0, 10)}.csv"`,
    },
  });
}

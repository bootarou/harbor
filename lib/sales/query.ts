import "server-only";
import { prisma } from "@/lib/prisma";

export type RevenueFilter = {
  from?: string; // "YYYY-MM"
  to?: string; // "YYYY-MM"
  status?: "all" | "confirmed";
};

export type RevenueCategory =
  | "sale"
  | "stamp_sale"
  | "tip_in"
  | "tip_out"
  | "thanks_in"
  | "thanks_out"
  | "ctip_in"
  | "ctip_out";

export type RevenueRecord = {
  date: Date;
  category: RevenueCategory;
  direction: "in" | "out";
  label: string; // 販売 / 投げ銭受取 / Thanks受取 / Thanks送信
  title: string;
  counterparty: string; // in: 送金元 / out: 送金先
  amount: number;
  currency: string;
  txHash: string;
  confirmed: boolean;
  jpyRate: number | null;
  jpyValue: number | null; // amount * jpyRate（円, 取引時レート換算）
};

function monthStartJst(ym: string): Date {
  return new Date(`${ym}-01T00:00:00+09:00`);
}
function monthEndExclusiveJst(ym: string): Date {
  const [y, m] = ym.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return new Date(`${ny}-${String(nm).padStart(2, "0")}-01T00:00:00+09:00`);
}
function dateRange(filter: RevenueFilter): { gte?: Date; lt?: Date } | null {
  const r: { gte?: Date; lt?: Date } = {};
  if (filter.from && /^\d{4}-\d{2}$/.test(filter.from))
    r.gte = monthStartJst(filter.from);
  if (filter.to && /^\d{4}-\d{2}$/.test(filter.to))
    r.lt = monthEndExclusiveJst(filter.to);
  return r.gte || r.lt ? r : null;
}
function jpyValue(amount: number, rate: number | null): number | null {
  return rate != null ? Math.round(amount * rate) : null;
}

// 著者(userId)の収益関連レコードを統合して日付降順で返す。
// 受取: 販売(購入) / 投げ銭受取 / Thanks受取  送信: 投げ銭送信 / Thanks送信
export async function getRevenueRecords(
  userId: string,
  filter: RevenueFilter
): Promise<RevenueRecord[]> {
  const range = dateRange(filter);
  const confirmedOnly = filter.status === "confirmed";

  const [
    purchases,
    stampSales,
    tips,
    tipsOut,
    thanksIn,
    thanksOut,
    ctipsIn,
    ctipsOut,
  ] = await Promise.all([
    prisma.purchase.findMany({
      where: {
        post: { authorId: userId },
        ...(confirmedOnly ? { confirmed: true } : {}),
        ...(range ? { purchasedAt: range } : {}),
      },
      select: {
        purchasedAt: true,
        amount: true,
        currency: true,
        buyerAddress: true,
        txHash: true,
        confirmed: true,
        jpyRate: true,
        post: { select: { title: true } },
      },
    }),
    // スタンプ販売（販売者＝自分が作成したスタンプの購入）。
    prisma.stampPurchase.findMany({
      where: {
        stamp: { authorId: userId },
        ...(confirmedOnly ? { confirmed: true } : {}),
        ...(range ? { purchasedAt: range } : {}),
      },
      select: {
        purchasedAt: true,
        amount: true,
        txHash: true,
        confirmed: true,
        jpyRate: true,
        stamp: { select: { name: true } },
        buyer: { select: { displayName: true } },
      },
    }),
    prisma.tip.findMany({
      where: {
        post: { authorId: userId },
        ...(confirmedOnly ? { confirmed: true } : {}),
        ...(range ? { confirmedAt: range } : {}),
      },
      select: {
        confirmedAt: true,
        amount: true,
        fromAddress: true,
        txHash: true,
        confirmed: true,
        anonymous: true,
        jpyRate: true,
        post: { select: { title: true } },
      },
    }),
    prisma.tip.findMany({
      where: {
        fromUserId: userId,
        ...(confirmedOnly ? { confirmed: true } : {}),
        ...(range ? { confirmedAt: range } : {}),
      },
      select: {
        confirmedAt: true,
        amount: true,
        toAddress: true,
        txHash: true,
        confirmed: true,
        jpyRate: true,
        post: { select: { title: true } },
      },
    }),
    prisma.thanks.findMany({
      where: {
        receiverUserId: userId,
        ...(confirmedOnly ? { status: "confirmed" } : {}),
        ...(range ? { createdAt: range } : {}),
      },
      select: {
        createdAt: true,
        amount: true,
        currency: true,
        senderAddress: true,
        txHash: true,
        status: true,
        jpyRate: true,
        thanksType: true,
        post: { select: { title: true } },
      },
    }),
    prisma.thanks.findMany({
      where: {
        senderUserId: userId,
        ...(confirmedOnly ? { status: "confirmed" } : {}),
        ...(range ? { createdAt: range } : {}),
      },
      select: {
        createdAt: true,
        amount: true,
        currency: true,
        receiverAddress: true,
        txHash: true,
        status: true,
        jpyRate: true,
        thanksType: true,
        post: { select: { title: true } },
      },
    }),
    // チャット投げ銭（受取）: 自分のメッセージへの投げ銭。削除済みメッセージ分も計上する。
    prisma.communityTip.findMany({
      where: {
        message: { userId },
        ...(confirmedOnly ? { confirmed: true } : {}),
        ...(range ? { createdAt: range } : {}),
      },
      select: {
        createdAt: true,
        amount: true,
        fromAddress: true,
        txHash: true,
        confirmed: true,
        jpyRate: true,
        message: { select: { topic: { select: { name: true } } } },
      },
    }),
    // チャット投げ銭（送信）。
    prisma.communityTip.findMany({
      where: {
        fromUserId: userId,
        ...(confirmedOnly ? { confirmed: true } : {}),
        ...(range ? { createdAt: range } : {}),
      },
      select: {
        createdAt: true,
        amount: true,
        toAddress: true,
        txHash: true,
        confirmed: true,
        jpyRate: true,
        message: { select: { topic: { select: { name: true } } } },
      },
    }),
  ]);

  const records: RevenueRecord[] = [
    ...purchases.map((p): RevenueRecord => {
      const amount = Number(p.amount);
      const rate = p.jpyRate != null ? Number(p.jpyRate) : null;
      return {
        date: p.purchasedAt,
        category: "sale",
        direction: "in",
        label: "販売",
        title: p.post.title,
        counterparty: p.buyerAddress,
        amount,
        currency: p.currency,
        txHash: p.txHash,
        confirmed: p.confirmed,
        jpyRate: rate,
        jpyValue: jpyValue(amount, rate),
      };
    }),
    ...stampSales.map((s): RevenueRecord => {
      const amount = Number(s.amount);
      const rate = s.jpyRate != null ? Number(s.jpyRate) : null;
      return {
        date: s.purchasedAt,
        category: "stamp_sale",
        direction: "in",
        label: "スタンプ販売",
        title: s.stamp.name,
        counterparty: s.buyer?.displayName ?? "購入者",
        amount,
        currency: "XYM",
        txHash: s.txHash,
        confirmed: s.confirmed,
        jpyRate: rate,
        jpyValue: jpyValue(amount, rate),
      };
    }),
    ...tips.map((t): RevenueRecord => {
      const amount = Number(t.amount);
      const rate = t.jpyRate != null ? Number(t.jpyRate) : null;
      return {
        date: t.confirmedAt,
        category: "tip_in",
        direction: "in",
        label: "投げ銭受取",
        title: t.post.title,
        counterparty: t.anonymous ? "(匿名)" : t.fromAddress,
        amount,
        currency: "XYM",
        txHash: t.txHash,
        confirmed: t.confirmed,
        jpyRate: rate,
        jpyValue: jpyValue(amount, rate),
      };
    }),
    ...tipsOut.map((t): RevenueRecord => {
      const amount = Number(t.amount);
      const rate = t.jpyRate != null ? Number(t.jpyRate) : null;
      return {
        date: t.confirmedAt,
        category: "tip_out",
        direction: "out",
        label: "投げ銭送信",
        title: t.post.title,
        counterparty: t.toAddress,
        amount,
        currency: "XYM",
        txHash: t.txHash,
        confirmed: t.confirmed,
        jpyRate: rate,
        jpyValue: jpyValue(amount, rate),
      };
    }),
    ...thanksIn.map((t): RevenueRecord => {
      const amount = Number(t.amount);
      const rate = t.jpyRate != null ? Number(t.jpyRate) : null;
      return {
        date: t.createdAt,
        category: "thanks_in",
        direction: "in",
        label: t.thanksType === "super_thanks" ? "Super Thanks受取" : "Thanks受取",
        title: t.post.title,
        counterparty: t.senderAddress,
        amount,
        currency: t.currency,
        txHash: t.txHash,
        confirmed: t.status === "confirmed",
        jpyRate: rate,
        jpyValue: jpyValue(amount, rate),
      };
    }),
    ...thanksOut.map((t): RevenueRecord => {
      const amount = Number(t.amount);
      const rate = t.jpyRate != null ? Number(t.jpyRate) : null;
      return {
        date: t.createdAt,
        category: "thanks_out",
        direction: "out",
        label: t.thanksType === "super_thanks" ? "Super Thanks送信" : "Thanks送信",
        title: t.post.title,
        counterparty: t.receiverAddress,
        amount,
        currency: t.currency,
        txHash: t.txHash,
        confirmed: t.status === "confirmed",
        jpyRate: rate,
        jpyValue: jpyValue(amount, rate),
      };
    }),
    ...ctipsIn.map((t): RevenueRecord => {
      const amount = Number(t.amount);
      const rate = t.jpyRate != null ? Number(t.jpyRate) : null;
      return {
        date: t.createdAt,
        category: "ctip_in",
        direction: "in",
        label: "チャット投げ銭受取",
        title: t.message.topic.name,
        counterparty: t.fromAddress,
        amount,
        currency: "XYM",
        txHash: t.txHash,
        confirmed: t.confirmed,
        jpyRate: rate,
        jpyValue: jpyValue(amount, rate),
      };
    }),
    ...ctipsOut.map((t): RevenueRecord => {
      const amount = Number(t.amount);
      const rate = t.jpyRate != null ? Number(t.jpyRate) : null;
      return {
        date: t.createdAt,
        category: "ctip_out",
        direction: "out",
        label: "チャット投げ銭送信",
        title: t.message.topic.name,
        counterparty: t.toAddress,
        amount,
        currency: "XYM",
        txHash: t.txHash,
        confirmed: t.confirmed,
        jpyRate: rate,
        jpyValue: jpyValue(amount, rate),
      };
    }),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return records;
}

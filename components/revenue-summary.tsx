import {
  getRevenueRecords,
  type RevenueFilter,
  type RevenueCategory,
} from "@/lib/sales/query";
import { fetchXymJpyRate } from "@/lib/rates";
import { formatXym } from "@/lib/format";

function ym(d: Date): string {
  return d.toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
}
function yyyy(d: Date): string {
  return d.toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 4);
}
function yen(n: number): string {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

type Bucket = { xym: number; jpy: number };
const zero = (): Bucket => ({ xym: 0, jpy: 0 });

function Line({ label, b }: { label: string; b: Bucket }) {
  return (
    <p className="flex justify-between gap-4">
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
      <span className="font-mono">
        {formatXym(b.xym)} XYM <span className="text-gray-400">/</span> {yen(b.jpy)}
      </span>
    </p>
  );
}

export async function RevenueSummary({
  userId,
  filter,
}: {
  userId: string;
  filter: RevenueFilter;
}) {
  const [records, allRecords, currentRate] = await Promise.all([
    getRevenueRecords(userId, filter),
    // 年次サマリは期間フィルタに依らず全期間（状態フィルタのみ適用）。
    getRevenueRecords(userId, { status: filter.status }),
    fetchXymJpyRate(),
  ]);

  const cat: Record<RevenueCategory, Bucket> = {
    sale: zero(),
    tip_in: zero(),
    tip_out: zero(),
    thanks_in: zero(),
    thanks_out: zero(),
  };
  const months = new Map<string, Record<RevenueCategory, Bucket>>();
  const ensureMonth = (m: string) => {
    let r = months.get(m);
    if (!r) {
      r = {
        sale: zero(),
        tip_in: zero(),
        tip_out: zero(),
        thanks_in: zero(),
        thanks_out: zero(),
      };
      months.set(m, r);
    }
    return r;
  };
  for (const rec of records) {
    const jpy = rec.jpyValue ?? 0;
    cat[rec.category].xym += rec.amount;
    cat[rec.category].jpy += jpy;
    const mb = ensureMonth(ym(rec.date));
    mb[rec.category].xym += rec.amount;
    mb[rec.category].jpy += jpy;
  }

  const incomeXym = cat.sale.xym + cat.tip_in.xym + cat.thanks_in.xym;
  const incomeJpy = cat.sale.jpy + cat.tip_in.jpy + cat.thanks_in.jpy;
  const outXym = cat.tip_out.xym + cat.thanks_out.xym;
  const outJpy = cat.tip_out.jpy + cat.thanks_out.jpy;
  const netXym = incomeXym - outXym;
  const netJpy = incomeJpy - outJpy;

  const monthRows = [...months.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  // 年次サマリ（全期間・暦年JST）
  const years = new Map<string, Record<RevenueCategory, Bucket>>();
  for (const rec of allRecords) {
    const y = yyyy(rec.date);
    let yb = years.get(y);
    if (!yb) {
      yb = {
        sale: zero(),
        tip_in: zero(),
        tip_out: zero(),
        thanks_in: zero(),
        thanks_out: zero(),
      };
      years.set(y, yb);
    }
    yb[rec.category].xym += rec.amount;
    yb[rec.category].jpy += rec.jpyValue ?? 0;
  }
  const yearRows = [...years.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  const qs = new URLSearchParams();
  if (filter.from) qs.set("from", filter.from);
  if (filter.to) qs.set("to", filter.to);
  if (filter.status === "confirmed") qs.set("status", "confirmed");
  const csvHref = `/api/revenue/export${qs.toString() ? `?${qs}` : ""}`;

  const periodLabel =
    filter.from || filter.to
      ? `${filter.from ?? "〜"} 〜 ${filter.to ?? "〜"}`
      : "全期間";

  return (
    <div className="flex flex-col gap-6">
      {/* フィルタ */}
      <form
        method="get"
        action="/revenue"
        className="flex flex-wrap items-end gap-3 text-sm"
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">開始月</span>
          <input
            type="month"
            name="from"
            defaultValue={filter.from ?? ""}
            className="rounded-md border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">終了月</span>
          <input
            type="month"
            name="to"
            defaultValue={filter.to ?? ""}
            className="rounded-md border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">状態</span>
          <select
            name="status"
            defaultValue={filter.status ?? "all"}
            className="rounded-md border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="all">すべて</option>
            <option value="confirmed">確定のみ</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-black px-3 py-1.5 font-medium text-white dark:bg-white dark:text-black"
        >
          適用
        </button>
        <a href="/revenue" className="self-center text-xs underline">
          リセット
        </a>
        <span className="ml-auto self-center text-xs text-gray-500 dark:text-gray-400">
          現在レート:{" "}
          {currentRate != null
            ? `¥${currentRate.toLocaleString("ja-JP", { maximumFractionDigits: 6 })}`
            : "取得不可"}{" "}
          / XYM
        </span>
      </form>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          期間：<span className="font-semibold">{periodLabel}</span>
        </p>
        {records.length > 0 && (
          <a
            href={csvHref}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm transition hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            CSV出力
          </a>
        )}
      </div>

      {/* サマリ（受取 / 送信 / 差引参考） */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <p className="mb-2 text-sm font-semibold">受取</p>
          <div className="flex flex-col gap-1 text-sm">
            <Line label="販売" b={cat.sale} />
            <Line label="投げ銭受取" b={cat.tip_in} />
            <Line label="Thanks受取" b={cat.thanks_in} />
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <p className="mb-2 text-sm font-semibold">送信</p>
          <div className="flex flex-col gap-1 text-sm">
            <Line label="投げ銭送信" b={cat.tip_out} />
            <Line label="Thanks送信" b={cat.thanks_out} />
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
          <p className="mb-2 text-sm font-semibold">差引参考</p>
          <div className="flex flex-col gap-1 text-sm">
            <Line label="受取合計" b={{ xym: incomeXym, jpy: incomeJpy }} />
            <Line label="送信合計" b={{ xym: outXym, jpy: outJpy }} />
            <div className="mt-1 border-t border-gray-200 pt-1 dark:border-gray-700">
              <Line label="差引" b={{ xym: netXym, jpy: netJpy }} />
            </div>
          </div>
        </div>
      </div>

      {/* 年次サマリ（確定申告の年次集計用・全期間） */}
      {yearRows.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">年次サマリ（暦年）</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="py-2 pr-3">年</th>
                  <th className="py-2 pr-3 text-right">販売(¥)</th>
                  <th className="py-2 pr-3 text-right">投げ銭受取(¥)</th>
                  <th className="py-2 pr-3 text-right">Thanks受取(¥)</th>
                  <th className="py-2 pr-3 text-right">受取合計(¥)</th>
                  <th className="py-2 pr-3 text-right">投げ銭送信(¥)</th>
                  <th className="py-2 pr-3 text-right">Thanks送信(¥)</th>
                  <th className="py-2 text-right">差引(¥)</th>
                </tr>
              </thead>
              <tbody>
                {yearRows.map(([y, b]) => {
                  const income = b.sale.jpy + b.tip_in.jpy + b.thanks_in.jpy;
                  const net = income - b.tip_out.jpy - b.thanks_out.jpy;
                  return (
                    <tr
                      key={y}
                      className="border-b border-gray-100 dark:border-gray-900"
                    >
                      <td className="py-2 pr-3 font-medium">{y}年</td>
                      <td className="py-2 pr-3 text-right">{yen(b.sale.jpy)}</td>
                      <td className="py-2 pr-3 text-right">{yen(b.tip_in.jpy)}</td>
                      <td className="py-2 pr-3 text-right">
                        {yen(b.thanks_in.jpy)}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold">
                        {yen(income)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {yen(b.tip_out.jpy)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {yen(b.thanks_out.jpy)}
                      </td>
                      <td className="py-2 text-right font-semibold">
                        {yen(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            ※ 年次サマリは期間フィルタに依らず全期間を暦年(JST)で集計します。受取合計は確定申告の収入の目安です。
          </p>
        </div>
      )}

      {/* 月次 */}
      {monthRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <th className="py-2 pr-3">年月</th>
                <th className="py-2 pr-3 text-right">販売(¥)</th>
                <th className="py-2 pr-3 text-right">投げ銭受取(¥)</th>
                <th className="py-2 pr-3 text-right">Thanks受取(¥)</th>
                <th className="py-2 pr-3 text-right">投げ銭送信(¥)</th>
                <th className="py-2 pr-3 text-right">Thanks送信(¥)</th>
                <th className="py-2 text-right">差引(¥)</th>
              </tr>
            </thead>
            <tbody>
              {monthRows.map(([m, b]) => {
                const net =
                  b.sale.jpy +
                  b.tip_in.jpy +
                  b.thanks_in.jpy -
                  b.tip_out.jpy -
                  b.thanks_out.jpy;
                return (
                  <tr
                    key={m}
                    className="border-b border-gray-100 dark:border-gray-900"
                  >
                    <td className="py-2 pr-3 font-medium">{m}</td>
                    <td className="py-2 pr-3 text-right">{yen(b.sale.jpy)}</td>
                    <td className="py-2 pr-3 text-right">{yen(b.tip_in.jpy)}</td>
                    <td className="py-2 pr-3 text-right">{yen(b.thanks_in.jpy)}</td>
                    <td className="py-2 pr-3 text-right">{yen(b.tip_out.jpy)}</td>
                    <td className="py-2 pr-3 text-right">{yen(b.thanks_out.jpy)}</td>
                    <td className="py-2 text-right font-semibold">{yen(net)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {records.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          該当する記録がありません。
        </p>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400">
        ※ 円換算は各取引の<strong>記録時点レート</strong>での参考値です（レート未取得は¥0扱い）。
        最終的な評価・記帳・確定申告などの会計/税務処理は利用者ご自身の責任で行ってください
        （運営は資産を預からず、会計・税務の代行も行いません）。
      </p>
    </div>
  );
}

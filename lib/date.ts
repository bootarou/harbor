// JST（Asia/Tokyo）基準の期間境界ユーティリティ。
// DB は UTC 保存だが「今日」「今月」は日本時間で区切りたいので、
// JST のローカル日付を組み立てて +09:00 付き ISO から UTC の Date を得る。

// JST の「今日 0:00」を表す UTC の Date を返す。
export function jstDayStart(now: Date = new Date()): Date {
  // sv-SE ロケールは "YYYY-MM-DD" 形式になる。
  const ymd = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${ymd}T00:00:00+09:00`);
}

// JST の「今月 1日 0:00」を表す UTC の Date を返す。
export function jstMonthStart(now: Date = new Date()): Date {
  const ym = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).format(now); // "YYYY-MM"
  return new Date(`${ym}-01T00:00:00+09:00`);
}

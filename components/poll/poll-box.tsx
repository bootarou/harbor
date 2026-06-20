import Link from "next/link";
import { voteOnPoll } from "@/app/poll/actions";

type PollOptionView = {
  id: string;
  label: string;
  count: number;
};

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(d);
}

// アンケート表示＋投票（Twitter風）。
// - 未投票かつ受付中: 選択肢をボタン表示（クリックで1票）。
// - 投票済み / 締切後 / 著者: 結果（バー・割合・票数）を表示。
// 1ユーザー1票・変更不可（投票後は結果のみ）。
export function PollBox({
  postId,
  options,
  totalVotes,
  myOptionId,
  closesAt,
  closed,
  isLoggedIn,
  isAuthor,
}: {
  postId: string;
  options: PollOptionView[];
  totalVotes: number;
  myOptionId: string | null;
  closesAt: Date | null;
  // 締切済みか（リクエスト時刻はサーバー側で判定して渡す）。
  closed: boolean;
  isLoggedIn: boolean;
  isAuthor: boolean;
}) {
  // 投票済み・締切後・著者は結果を表示。それ以外（未投票で受付中）は選択肢を表示。
  const showResults = myOptionId !== null || closed || isAuthor;

  return (
    <section className="mt-8 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">📊 アンケート</h2>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {totalVotes} 票
          {closesAt &&
            (closed
              ? `・締め切りました（${formatDate(closesAt)}）`
              : `・締切 ${formatDate(closesAt)}`)}
        </span>
      </div>

      {showResults ? (
        <ul className="flex flex-col gap-2">
          {options.map((o) => {
            const pct = totalVotes > 0 ? Math.round((o.count / totalVotes) * 100) : 0;
            const mine = o.id === myOptionId;
            // 最多得票（同数なら複数）を太字で目立たせる。
            const isTop = o.count > 0 && o.count === Math.max(...options.map((x) => x.count));
            return (
              <li key={o.id}>
                <div className="relative overflow-hidden rounded-md border border-gray-200 dark:border-gray-700">
                  {/* 割合バー */}
                  <div
                    className={`absolute inset-y-0 left-0 ${
                      mine
                        ? "bg-indigo-200 dark:bg-indigo-900/60"
                        : "bg-gray-100 dark:bg-gray-800"
                    }`}
                    style={{ width: `${pct}%` }}
                    aria-hidden
                  />
                  <div className="relative flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className={`flex items-center gap-1.5 ${isTop ? "font-semibold" : ""}`}>
                      {mine && <span className="text-indigo-600 dark:text-indigo-300">✓</span>}
                      {o.label}
                    </span>
                    <span className="shrink-0 tabular-nums text-gray-600 dark:text-gray-300">
                      {pct}%・{o.count}票
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : isLoggedIn ? (
        <ul className="flex flex-col gap-2">
          {options.map((o) => (
            <li key={o.id}>
              <form action={voteOnPoll}>
                <input type="hidden" name="optionId" value={o.id} />
                <button
                  type="submit"
                  className="w-full rounded-md border border-indigo-300 px-3 py-2 text-left text-sm font-medium text-indigo-800 transition hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-200 dark:hover:bg-indigo-950"
                >
                  {o.label}
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-2">
          {options.map((o) => (
            <li key={o.id}>
              <Link
                href={`/login?callbackUrl=/posts/${postId}`}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
              >
                {o.label}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!showResults && (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {isLoggedIn
            ? "投票すると結果が表示されます（1人1票・変更不可）。"
            : "ログインすると投票できます。投票後に結果が表示されます。"}
        </p>
      )}
    </section>
  );
}

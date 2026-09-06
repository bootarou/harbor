"use client";

import { useId, useRef, useState, type ReactNode } from "react";

export type NotificationTab = {
  key: string;
  label: string;
  /** タブ見出しの右に出す件数。0 なら出さない。 */
  count: number;
  /** 未読など、注意を引きたい件数がある場合に●を出す。 */
  hasBadge?: boolean;
  content: ReactNode;
};

// 通知ページのタブ。以前は3つのセクションを縦に並べていたため、
// リアクションや Thanks を見るのにスクロールが必要だった。
//
// パネルは全て DOM に残したまま hidden で出し分ける。
// リアクション欄の ThanksButtons が状態を持つため、
// タブを行き来しても入力中の状態が消えないようにする。
export function NotificationTabs({ tabs }: { tabs: NotificationTab[] }) {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 左右キーでタブ移動（WAI-ARIA の tablist の作法に合わせる）。
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const last = tabs.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = active === last ? 0 : active + 1;
    else if (e.key === "ArrowLeft") next = active === 0 ? last : active - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div>
      {/* 下線はスクロールコンテナではなく外側に置く。border-b を
          スクロールコンテナ側に持たせると、ボタンの -mb-px が縦方向に
          はみ出して縦スクロールバーが出てしまう
          （overflow-x:auto を指定すると overflow-y も auto に計算されるため）。
          タブは3つで大半の画面に収まるので、横スクロールバーも隠す。 */}
      <div className="mb-5 border-b border-gray-200 dark:border-gray-800">
        <div
          role="tablist"
          aria-label="通知の種類"
          className="-mb-px flex gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((t, i) => {
            const selected = i === active;
            return (
              <button
                key={t.key}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${t.key}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${t.key}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(i)}
                onKeyDown={onKeyDown}
                className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition ${
                  selected
                    ? "border-teal-600 font-semibold text-teal-700 dark:border-teal-500 dark:text-teal-400"
                    : "border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:text-gray-100"
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                      selected
                        ? "bg-teal-600 text-white"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                  >
                    {t.count}
                  </span>
                )}
                {t.hasBadge && (
                  <span
                    className="ml-1 inline-block h-2 w-2 rounded-full bg-red-500 align-middle"
                    aria-label="未読あり"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {tabs.map((t, i) => (
        <div
          key={t.key}
          role="tabpanel"
          id={`${baseId}-panel-${t.key}`}
          aria-labelledby={`${baseId}-tab-${t.key}`}
          hidden={i !== active}
          tabIndex={0}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}

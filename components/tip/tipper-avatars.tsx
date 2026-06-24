// 記事に投げ銭したユーザーのアイコンをスタック表示する（社会的証明 / 承認欲求）。
// 表示順は先着順（confirmedAt 昇順）。早く投げた人ほど左に並び、先頭には 👑 First Tipper バッジ。
// サーバー/クライアントどちらからも使えるよう、ネイティブ title 属性でツールチップを出す。

export type TipperInfo = {
  userId: string | null;
  avatarUrl: string | null;
  displayName: string | null;
  anonymous: boolean;
  isFirst: boolean;
};

const VARIANTS = {
  card: {
    avatar: "h-[18px] w-[18px]", // 18px（黄色バッジ内に収まるサイズ）
    crown: "text-[16px] -right-1.5 -top-2.5", // 16px（従来8pxの2倍）
    more: "h-[18px] min-w-[18px] text-[10px]",
  },
  detail: {
    avatar: "h-6 w-6", // 24px
    crown: "text-[20px] -right-1.5 -top-3", // 20px（従来10pxの2倍）
    more: "h-6 min-w-6 text-[11px]",
  },
} as const;

const MAX_SHOWN = 6;

function tooltipFor(t: TipperInfo): string {
  if (t.isFirst) return "👑 First Tipper";
  if (t.anonymous) return "Anonymous Tipper";
  return t.displayName ?? "Tipper";
}

export function TipperAvatars({
  tippers,
  moreCount = 0,
  variant = "card",
  showCrown = true,
}: {
  tippers: TipperInfo[];
  // 6人を超える分の人数（「+N」表示用）。
  moreCount?: number;
  variant?: keyof typeof VARIANTS;
  // 先頭(First Tipper)の 👑 を表示するか。
  showCrown?: boolean;
}) {
  // 0件のときはスペースを取らない。
  if (!tippers || tippers.length === 0) return null;

  const v = VARIANTS[variant];
  const shown = tippers.slice(0, MAX_SHOWN);
  const extra = moreCount > 0 ? moreCount : Math.max(0, tippers.length - MAX_SHOWN);

  return (
    <span className="flex items-center">
      {shown.map((t, i) => {
        const src = t.anonymous
          ? "/avatar-placeholder.svg"
          : t.avatarUrl || "/avatar-placeholder.svg";
        return (
          <span
            key={t.userId ?? `t-${i}`}
            className={`relative ${i > 0 ? "-ml-2" : ""}`}
            style={{ zIndex: i }}
            title={tooltipFor(t)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              className={`${v.avatar} rounded-full bg-gray-100 object-cover ring-2 ring-white dark:bg-gray-800 dark:ring-gray-900`}
            />
            {t.isFirst && showCrown && (
              <span
                className={`pointer-events-none absolute ${v.crown} leading-none`}
                aria-label="First Tipper"
              >
                👑
              </span>
            )}
          </span>
        );
      })}
      {extra > 0 && (
        <span
          className={`relative -ml-2 flex ${v.more} items-center justify-center rounded-full bg-gray-200 px-1 font-semibold text-gray-700 ring-2 ring-white dark:bg-gray-700 dark:text-gray-200 dark:ring-gray-900`}
          style={{ zIndex: MAX_SHOWN }}
          title={`他 ${extra} 人`}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}

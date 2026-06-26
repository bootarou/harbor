// Harbor Thanks ステータス計算（送金ロジック・金額には一切関与しない、純粋な表示用ロジック）。
// 「何人にThanksを送ったか（=何人の読者に感謝したか）」を記事の航海ステータスに変換する。
// サーバー/クライアント双方から import できるよう副作用なしの純関数のみで構成する。

export type ThanksStatus =
  | "docked"
  | "preparing"
  | "sailed"
  | "voyaging"
  | "discovery";

export type ThanksStatusMeta = {
  key: ThanksStatus;
  min: number; // このステータスになる最小Thanks数
  emoji: string;
  label: string;
  description: string;
};

// min 昇順で定義（statusForCount / nextStatusHint がこの順序に依存）。
export const THANKS_STATUSES: ThanksStatusMeta[] = [
  {
    key: "docked",
    min: 0,
    emoji: "🚣",
    label: "停泊中",
    description: "この船はまだ港で、出航の時を待っています。",
  },
  {
    key: "preparing",
    min: 2,
    emoji: "⛵",
    label: "出航準備",
    description: "感謝が集まり、出航の準備が整いつつあります。",
  },
  {
    key: "sailed",
    min: 6,
    emoji: "🚢",
    label: "出港",
    description: "この船は港を離れ、新しい読者へ向かっています。",
  },
  {
    key: "voyaging",
    min: 20,
    emoji: "🌊",
    label: "航海中",
    description: "多くの感謝を受け、広い海をゆく航海が続いています。",
  },
  {
    key: "discovery",
    min: 100,
    emoji: "🏝️",
    label: "新大陸発見",
    description: "数えきれない感謝に導かれ、新しい大陸へ辿り着きました。",
  },
];

const BY_KEY = new Map<string, ThanksStatusMeta>(
  THANKS_STATUSES.map((s) => [s.key, s])
);

// Thanks 件数から現在のステータスキーを求める。
export function statusForCount(count: number): ThanksStatus {
  let result: ThanksStatus = "docked";
  for (const s of THANKS_STATUSES) {
    if (count >= s.min) result = s.key;
  }
  return result;
}

// ステータスキーからメタ情報を取得（不明値は docked にフォールバック）。
export function statusMeta(status: string): ThanksStatusMeta {
  return BY_KEY.get(status) ?? THANKS_STATUSES[0];
}

// ステータスの序列（昇格判定に使う）。
export function statusRank(status: string): number {
  const i = THANKS_STATUSES.findIndex((s) => s.key === status);
  return i < 0 ? 0 : i;
}

// 次ステータスまでの残りThanks数ヒントを返す。最上位（新大陸発見）到達後は次が無いので null。
// 例: count=2 → { remaining: 4, status: 出港 }。
export function nextStatusHint(
  count: number
): { remaining: number; status: ThanksStatusMeta } | null {
  const next = THANKS_STATUSES.find((s) => s.min > count);
  if (!next) return null;
  return { remaining: next.min - count, status: next };
}

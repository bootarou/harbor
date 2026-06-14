// Thanks / リアクション機能の設定・定数。
// Thanks は「投げ銭」とは分離した、無償リアクションへの軽い感謝（固定額）。

export const REACTION_TYPES = [
  { key: "like", emoji: "👍", label: "いいね" },
  { key: "empathy", emoji: "❤️", label: "共感" },
  { key: "helpful", emoji: "💡", label: "参考になった" },
  { key: "fun", emoji: "🔥", label: "面白い" },
  { key: "thanks", emoji: "🙏", label: "ありがとう" },
] as const;

export type ReactionKey = (typeof REACTION_TYPES)[number]["key"];

export const REACTION_KEYS: ReactionKey[] = REACTION_TYPES.map((r) => r.key);

export function isReactionKey(v: unknown): v is ReactionKey {
  return typeof v === "string" && (REACTION_KEYS as string[]).includes(v);
}

export function reactionMeta(key: string) {
  return REACTION_TYPES.find((r) => r.key === key);
}

// Thanks 種別と固定額（初期実装は固定。管理者既定値）。
export const THANKS_CONFIG = {
  currency: "XYM",
  thanks: { amount: 0.39, label: "Thanks!" },
  super_thanks: { amount: 3.9, label: "Super Thanks" },
} as const;

export type ThanksType = "thanks" | "super_thanks";

export function thanksAmount(type: ThanksType): number {
  return THANKS_CONFIG[type].amount;
}

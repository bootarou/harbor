import "server-only";
import "@/lib/wallet/polyfill";
import { KeyGenerator, Address } from "symbol-sdk";
import { getNodeUrl } from "@/lib/wallet/symbol";

// SMD（social_meta_data）: Symbol アカウントメタデータからプロフィール候補を取得する。
// 「ユーザー自身による宣言データ」として扱い、無条件に信用しない（本人発行のみ・形式検証）。

const SMD_KEY = "social_meta_data";
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)(\?.*)?$/i;

export type SmdCandidate = {
  name?: string;
  imageUrl?: string;
  url?: string;
  namespace?: string;
};

export type SmdResult =
  | { status: "none" }
  | { status: "invalid"; reason: string }
  | { status: "ok"; candidate: SmdCandidate };

function decodeAddress(hex: string): string | null {
  try {
    return Address.createFromEncoded(hex).plain();
  } catch {
    return /^[A-Z2-7]{39}$/.test(hex) ? hex : null;
  }
}

function decodeValue(raw: string): string {
  // REST が hex で返す場合に備える。hex で偶数長なら UTF-8 デコードを試す。
  if (/^[0-9a-fA-F]+$/.test(raw) && raw.length % 2 === 0) {
    try {
      const s = Buffer.from(raw, "hex").toString("utf8");
      if (s.includes("{")) return s;
    } catch {
      // fall through
    }
  }
  return raw;
}

// 安全な https 画像URLか（svg / data: / javascript: 等は拒否）。
function safeImageUrl(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!/^https:\/\//i.test(s)) return undefined;
  if (/\.svg(\?.*)?$/i.test(s)) return undefined;
  if (!IMAGE_EXT.test(s)) return undefined;
  return s;
}
function safeUrl(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return /^https:\/\//i.test(s) ? s : undefined;
}
function safeText(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
}

function validate(json: unknown): SmdCandidate | null {
  if (typeof json !== "object" || json === null) return null;
  const o = json as Record<string, unknown>;
  const candidate: SmdCandidate = {
    name: safeText(o.name, 50),
    imageUrl: safeImageUrl(o.imageUrl),
    url: safeUrl(o.url),
    namespace: safeText(o.namespace, 64),
  };
  // 何も有効でなければ null
  if (!candidate.name && !candidate.imageUrl && !candidate.url && !candidate.namespace) {
    return null;
  }
  return candidate;
}

/**
 * 指定アドレスの SMD を取得・検証する。本人(source==target==address)のみ採用。
 */
export async function fetchSmd(address: string): Promise<SmdResult> {
  const keyHex = KeyGenerator.generateUInt64Key(SMD_KEY).toHex();
  const url = `${getNodeUrl()}/metadata?targetAddress=${address}&scopedMetadataKey=${keyHex}&metadataType=0&pageSize=20`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(7000) });
  } catch {
    return { status: "none" };
  }
  if (!res.ok) return { status: "none" };

  const data = (await res.json().catch(() => null)) as {
    data?: {
      metadataEntry?: {
        sourceAddress?: string;
        targetAddress?: string;
        value?: string;
      };
    }[];
  } | null;

  const entries = data?.data ?? [];
  // 本人発行（source==target==address）のものだけ対象
  const entry = entries.find((e) => {
    const m = e.metadataEntry;
    if (!m) return false;
    const src = m.sourceAddress ? decodeAddress(m.sourceAddress) : null;
    const tgt = m.targetAddress ? decodeAddress(m.targetAddress) : null;
    return src === address && tgt === address;
  });

  if (!entry?.metadataEntry?.value) return { status: "none" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeValue(entry.metadataEntry.value));
  } catch {
    return { status: "invalid", reason: "JSONとして解釈できません" };
  }

  const candidate = validate(parsed);
  if (!candidate) {
    return { status: "invalid", reason: "必要なフィールドが不正です" };
  }
  return { status: "ok", candidate };
}

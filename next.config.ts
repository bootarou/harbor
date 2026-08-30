import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// LiveKit（コミュニティの音声スペース）への接続先を CSP に許可する。
// LIVEKIT_WS_URL は ws(s)://host:7880 形式。WebSocket に加え、livekit-client が
// 同ホストへ投げる HTTP リクエスト（接続検証など）も通す必要があるため両方を列挙する。
// ※ 音声メディア自体は WebRTC(UDP) なので CSP の対象外。
// ※ Cloudflare Tunnel を経由させない直結の想定（UDP 50000-50100 / 7880 / 7881 を開放）。
function livekitCspOrigins(): string[] {
  const raw = process.env.LIVEKIT_WS_URL?.trim();
  if (!raw) return [];
  try {
    const u = new URL(raw);
    const httpScheme = u.protocol === "wss:" ? "https:" : "http:";
    return [`${u.protocol}//${u.host}`, `${httpScheme}//${u.host}`];
  } catch {
    console.warn("LIVEKIT_WS_URL の形式が不正です（CSP に追加しません）:", raw);
    return [];
  }
}

const livekitOrigins = livekitCspOrigins();

// Content Security Policy（仕様書 §6: XSS 対策 / CSP 設定）。
// - script/style は Next.js のインライン bootstrap・next/font のため 'unsafe-inline' を許可。
//   （nonce ベースのより厳格な CSP は将来の強化余地）
// - img は data:（QRコード）/ blob: / https:（S3画像）/ 自身（/uploads）を許可。
// - connect は Symbol ノード（任意の https エンドポイント）への fetch を許可。
const csp = [
  "default-src 'self'",
  // 'wasm-unsafe-eval': symbol-hd-wallets→bip32→tiny-secp256k1 がブラウザで
  // WebAssembly(secp256k1.wasm) を使うため必須。これが無いと本番でウォレット系
  // （ログイン/新規登録/送金）の JS が CSP に阻まれ動かない。
  // Cloudflare（Tunnel / Web Analytics）が自動注入するビーコンを許可。
  // 解析を使わない場合は Cloudflare 側で Web Analytics を無効化してもよい。
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://static.cloudflareinsights.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https:${livekitOrigins.length ? ` ${livekitOrigins.join(" ")}` : ""}${isDev ? " ws:" : ""}`,
  // YouTube / TikTok 埋め込み（外部URL投稿）を許可。frame-src 未指定だと default-src 'self' で iframe がブロックされる。
  "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://www.tiktok.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
]
  .join("; ")
  .concat(";");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // camera / nfc は同一オリジンのみ許可（ウォレットのQR読み取り・NFCタグで使用）。
    // microphone はコミュニティの音声スペース（LiveKit）で使うため self のみ許可。
    // 既定でも nfc は self だが、意図を明示し将来の取りこぼしを防ぐため列挙する。
    // geolocation は未使用のため全面禁止のまま。
    key: "Permissions-Policy",
    value: "camera=(self), nfc=(self), microphone=(self), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

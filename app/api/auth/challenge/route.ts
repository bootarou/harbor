import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getNetworkName, networkAddressPrefix } from "@/lib/did";
import { authLog, requestMeta } from "@/lib/audit";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/ratelimit";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

// ログイン用ワンタイムチャレンジを発行する。
// 署名対象メッセージはサーバーで生成・保存し、後でクライアント申告の message は信用しない。
export async function POST(request: Request) {
  // 未認証で叩けるため IP 単位で制限（DB 肥大・書き込み増幅 DoS 対策）。
  const rl = rateLimit(`challenge:${getClientIp(request)}`, 20, 10 * 60 * 1000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const json = (await request.json().catch(() => null)) as {
    address?: string;
  } | null;
  const address = json?.address?.trim() ?? "";
  const network = getNetworkName();

  if (!/^[A-Z2-7]{39}$/.test(address)) {
    return NextResponse.json(
      { error: "アドレスの形式が正しくありません" },
      { status: 400 }
    );
  }
  if (address[0] !== networkAddressPrefix(network)) {
    return NextResponse.json(
      { error: `ネットワーク(${network})と一致しないアドレスです` },
      { status: 400 }
    );
  }

  const nonce = randomBytes(24).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
  const message = [
    "Login to Harbor",
    "",
    "Purpose: Authentication",
    `Network: ${network}`,
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued At: ${now.toISOString()}`,
    `Expires At: ${expiresAt.toISOString()}`,
  ].join("\n");

  const challenge = await prisma.challenge.create({
    data: { address, network, nonce, message, expiresAt },
    select: { id: true },
  });

  const meta = requestMeta(request);
  await authLog("challenge_issued", { address, ...meta });

  return NextResponse.json({ challengeId: challenge.id, message, expiresAt });
}

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { addressToDid, getNetworkName, shortAddress } from "@/lib/did";
import { deriveAddressFromPublicKey, verifySignature } from "@/lib/did/verify";
import { authLog } from "@/lib/audit";

// Symbol DID（チャレンジ署名）認証 (Auth.js v5)。
// クライアントは /api/auth/challenge で得たメッセージに秘密鍵で署名し、
// {challengeId, address, publicKey, signature} を送る。秘密鍵はサーバーに送られない。
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7日間
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      id: "did",
      name: "Symbol DID",
      credentials: {
        challengeId: {},
        address: {},
        publicKey: {},
        signature: {},
      },
      authorize: async (credentials) => {
        const challengeId = String(credentials?.challengeId ?? "");
        const address = String(credentials?.address ?? "");
        const publicKey = String(credentials?.publicKey ?? "");
        const signature = String(credentials?.signature ?? "");
        if (!challengeId || !address || !publicKey || !signature) {
          return null;
        }

        const network = getNetworkName();

        const challenge = await prisma.challenge.findUnique({
          where: { id: challengeId },
        });
        // 検証: 存在・未使用・有効期限内・アドレス一致・ネットワーク一致
        if (
          !challenge ||
          challenge.used ||
          challenge.expiresAt.getTime() < Date.now() ||
          challenge.address !== address ||
          challenge.network !== network
        ) {
          await authLog("did_login_failed", { address, detail: "challenge" });
          return null;
        }

        // 公開鍵→アドレス導出が要求アドレスと一致すること
        if (deriveAddressFromPublicKey(publicKey) !== address) {
          await authLog("did_login_failed", { address, detail: "pubkey" });
          return null;
        }

        // 署名検証（サーバー保存の message を使用。クライアント申告は信用しない）
        if (!verifySignature(publicKey, challenge.message, signature)) {
          await authLog("did_login_failed", { address, detail: "signature" });
          return null;
        }

        // nonce（チャレンジ）を使用済みにする
        await prisma.challenge.update({
          where: { id: challengeId },
          data: { used: true },
        });

        // ユーザーの取得 or 作成（初回ログインで新規作成）
        const existing = await prisma.user.findUnique({
          where: { symbolAddress: address },
          select: { id: true, displayName: true },
        });

        let user: { id: string; displayName: string };
        if (existing) {
          await prisma.user.update({
            where: { id: existing.id },
            data: { lastLoginAt: new Date(), publicKey },
          });
          user = existing;
          await authLog("did_login_success", { userId: user.id, address });
        } else {
          const created = await prisma.user.create({
            data: {
              symbolAddress: address,
              did: addressToDid(address, network),
              network,
              publicKey,
              xymAddress: address,
              displayName: shortAddress(address),
              lastLoginAt: new Date(),
            },
            select: { id: true, displayName: true },
          });
          user = created;
          await authLog("did_register", { userId: user.id, address });
          await authLog("did_login_success", { userId: user.id, address });
        }

        return { id: user.id, name: user.displayName };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});

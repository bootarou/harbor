import type { DefaultSession } from "next-auth";

// session.user.id を型として利用できるように module augmentation を行う。
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}

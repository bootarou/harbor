"use client";

import { SessionProvider } from "next-auth/react";

// クライアント側で useSession 等を使えるようにする共通プロバイダ。
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

"use client";

import { SessionProvider } from "next-auth/react";
import { NotificationManager } from "@/components/notification-manager";

// クライアント側で useSession 等を使えるようにする共通プロバイダ。
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <NotificationManager />
      {children}
    </SessionProvider>
  );
}

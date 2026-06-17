import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { siteBaseUrl } from "@/lib/site";

// フォントはシステムフォント（globals.css で定義）を使用。
// ビルド時に Google Fonts を取得しないため、オフライン/制限環境でもビルドできる。

export const metadata: Metadata = {
  metadataBase: new URL(siteBaseUrl()),
  title: {
    default: "⚓Harbor",
    template: "%s | ⚓Harbor",
  },
  description: "⚓Harbor — Symbol(XYM) で投げ銭できるノンカストディアル・ブログ",
  openGraph: {
    title: "⚓Harbor",
    description: "⚓Harbor — Symbol(XYM) で投げ銭できるノンカストディアル・ブログ",
    type: "website",
    images: ["/og-default.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "⚓Harbor",
    description: "⚓Harbor — Symbol(XYM) で投げ銭できるノンカストディアル・ブログ",
    images: ["/og-default.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <Providers>
          <SiteHeader />
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}

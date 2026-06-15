import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ),
  title: {
    default: "Harbor",
    template: "%s | Harbor",
  },
  description: "Harbor — Symbol(XYM) で投げ銭できるノンカストディアル・ブログ",
  openGraph: {
    title: "Harbor",
    description: "Harbor — Symbol(XYM) で投げ銭できるノンカストディアル・ブログ",
    type: "website",
    images: ["/og-default.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Harbor",
    description: "Harbor — Symbol(XYM) で投げ銭できるノンカストディアル・ブログ",
    images: ["/og-default.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
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

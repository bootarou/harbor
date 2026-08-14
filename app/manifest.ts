import type { MetadataRoute } from "next";

// PWA（ホーム画面追加）用の Web App Manifest。
// アイコン・テーマ色・表示モードを提供し、ホームアイコン/起動画面の解像度・見栄えを整える。
export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_SITE_NAME || "⚓Harbor";
  return {
    name: `${name} — Symbol(XYM) 投げ銭ブログ`,
    short_name: name.replace(/^⚓/, ""),
    description:
      "Symbol(XYM) で投げ銭できるノンカストディアル・ブログ。記事・スタンプ・コミュニティ。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#02c39a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
